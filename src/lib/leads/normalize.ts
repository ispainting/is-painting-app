// Turns what each door delivers (Meta, Google, the website form, ORION/Make) into one shape the
// inbox and the pipeline can both use. No database and no network here: only reading the fields.
import type { LeadSource } from "@prisma/client";
import { compactAttribution, type LeadAttribution } from "../orion-attribution";
import { SERVICE_AREA, readable, type LeadCardFields } from "../orion-lead-card";

export type PipelineSource = "Website" | "Meta" | "Concierge" | "Google" | "GoogleForm";

export interface LeadOrigin {
  /** The ad platform when the sender names it ("Meta", "Google"); otherwise inferred from the source. */
  platform?: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
  formId?: string;
  formName?: string;
  gclid?: string;
  fbclid?: string;
  utmSource?: string;
  utmCampaign?: string;
  utmContent?: string;
}

export interface LeadIntake extends LeadCardFields {
  source: LeadSource;
  /** The lead's id on its platform, unique per source. */
  externalId: string;
  /** The key the pipeline remembers this lead by, shared by every door that can deliver it. */
  pipelineKey: string;
  pipelineSource: PipelineSource;
  receivedAt: Date;
  /** False when the delivery carried no date of its own and receivedAt is just "now". */
  dated: boolean;
  origin: LeadOrigin;
  rawPayload: unknown;
}

/** The campaign on the card, as ORION's lead outcomes read it. The platform defaults to the door's. */
export function attributionOf(intake: LeadIntake): LeadAttribution | null {
  const { origin } = intake;
  const platform = origin.platform ?? (intake.pipelineSource === "Meta" ? "Meta" : intake.pipelineSource === "Google" || intake.pipelineSource === "GoogleForm" ? "Google" : undefined);
  return compactAttribution({
    platform,
    campaignId: origin.campaignId,
    campaignName: origin.campaignName,
    adSetId: origin.adsetId,
    adSetName: origin.adsetName,
    adId: origin.adId,
    adName: origin.adName,
    formId: origin.formId,
    formName: origin.formName,
  });
}

// ─── Single fields ───────────────────────────────────────

/** E.164, assuming the US when no country is given. Null when the text can't be read as a number. */
export function normalizePhone(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (text.startsWith("+") && !digits.startsWith("1")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}

const SERVICES: [string, RegExp][] = [
  ["Cabinets", /cabinet/i],
  ["Interior", /interior/i],
  ["Exterior", /exterior/i],
  ["Commercial", /commercial/i],
];

/** One of the four services when the answer names exactly one; otherwise the answer as given. */
export function normalizeService(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const matches = SERVICES.filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0][0] : readable(text);
}

// CLAUDE.md hard rule 1. Same list as the platform's serviceArea.ts: only Boston metro is flagged,
// because an unknown town may still be in the map, and a ZIP alone says nothing here.
const BOSTON_METRO = ["boston", "cambridge", "somerville", "brookline", "newton"];

export function isOutOfMap(city: string | null | undefined): boolean {
  const text = city?.toLowerCase() ?? "";
  return BOSTON_METRO.some((town) => text.includes(town));
}

/** Meta's Lead Ads Testing Tool fills every field with "<test lead: dummy data for …>". */
export function isTestLead(lead: LeadCardFields): boolean {
  return [lead.name, lead.email, ...Object.values(lead.details ?? {})].some((v) => v && /dummy data|test lead/i.test(v));
}

// ─── Fitting answers into the card ───────────────────────

type Slot = "name" | "email" | "phone" | "address" | "city" | "state" | "zipCode" | "service" | "message";

// The same limits POST /api/orion/leads validates. An answer past them stays on the card as an extra
// answer: one over-long field must never cost the whole lead.
const SLOT_MAX: Record<Slot, number> = { name: 200, email: 200, phone: 30, address: 300, city: 100, state: 50, zipCode: 20, service: 120, message: 5000 };
const SLOT_LABEL: Record<Slot, string> = { name: "Name", email: "Email", phone: "Phone", address: "Address", city: "Town", state: "State", zipCode: "ZIP", service: "Service", message: "Message" };
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fit(slots: Partial<Record<Slot, string>>, answers: Record<string, string>): LeadCardFields {
  const fields: LeadCardFields = {};
  const details: Record<string, string> = {};
  for (const [label, value] of Object.entries(answers)) {
    const text = value.trim();
    if (text) details[label] = text.slice(0, 5000);
  }
  for (const slot of Object.keys(slots) as Slot[]) {
    const text = slots[slot]?.trim();
    if (!text) continue;
    if (text.length > SLOT_MAX[slot] || (slot === "email" && !LOOKS_LIKE_EMAIL.test(text))) details[SLOT_LABEL[slot]] = text.slice(0, 5000);
    else fields[slot] = text;
  }
  if (isOutOfMap(fields.city)) details[SERVICE_AREA] = "Outside the service map, does not count as a lead";
  if (Object.keys(details).length) fields.details = details;
  return fields;
}

function dateOr(value: unknown): { receivedAt: Date; dated: boolean } {
  const parsed = typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? { receivedAt: parsed, dated: true } : { receivedAt: new Date(), dated: false };
}

function text(value: unknown, max = 255): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const out = String(value).trim();
  return out ? out.slice(0, max) : undefined;
}

// ─── Meta (Lead Ads) ─────────────────────────────────────

export interface MetaGraphLead {
  id: string;
  created_time?: string;
  field_data?: { name: string; values?: string[] }[];
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
}

// Each form names its questions differently (service_type, what_type_of_painting_service_do_you_need?,
// town, project_zip_code). First match wins, so the strict contact patterns come first.
const META_SLOTS: [Slot, RegExp][] = [
  ["email", /^(work_)?email(_address)?$/i],
  ["phone", /^(work_)?(phone|mobile)(_number)?$/i],
  ["zipCode", /(^|_)(zip|postal|post)(_|\?|$)/i],
  ["city", /(^|_)(town|city)(_|\?|$)/i],
  ["state", /^(state|province)$/i],
  ["address", /(^|_)(address|street)(_|\?|$)/i],
  ["service", /(^|_)services?(_|\?|$)|type_of_(work|project)/i],
  ["name", /^(full_)?name$/i],
];

export function leadFromMeta(raw: MetaGraphLead): LeadIntake {
  const slots: Partial<Record<Slot, string>> = {};
  const answers: Record<string, string> = {};
  const parts: { first_name?: string; last_name?: string } = {};
  for (const field of raw.field_data ?? []) {
    const value = (field.values ?? []).join(", ").trim();
    if (!value) continue;
    if (field.name === "first_name" || field.name === "last_name") {
      parts[field.name] = value;
      continue;
    }
    const slot = META_SLOTS.find(([, pattern]) => pattern.test(field.name))?.[0];
    if (slot && !slots[slot]) slots[slot] = value;
    else answers[field.name] = value;
  }
  if (!slots.name) slots.name = [parts.first_name, parts.last_name].filter(Boolean).join(" ");

  return {
    ...fit(slots, answers),
    source: "META",
    externalId: raw.id,
    pipelineKey: `meta:${raw.id}`,
    pipelineSource: "Meta",
    ...dateOr(raw.created_time),
    origin: {
      campaignId: text(raw.campaign_id, 100),
      campaignName: text(raw.campaign_name),
      adsetId: text(raw.adset_id, 100),
      adId: text(raw.ad_id, 100),
      adName: text(raw.ad_name),
      formId: text(raw.form_id, 100),
    },
    rawPayload: raw,
  };
}

const META_PAGE_ID = "205413115997902";

/** The new-lead ids in a webhook delivery, for the company's Page only. */
export function leadgenIdsFromWebhook(payload: unknown): string[] {
  const entries = (payload as { entry?: unknown } | null)?.entry;
  if (!Array.isArray(entries)) return [];
  const ids: string[] = [];
  for (const entry of entries as { id?: unknown; changes?: { field?: unknown; value?: { leadgen_id?: unknown; page_id?: unknown } }[] }[]) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== "leadgen") continue;
      const id = change.value?.leadgen_id;
      const page = String(change.value?.page_id ?? entry.id ?? "");
      if ((typeof id === "string" || typeof id === "number") && page === META_PAGE_ID) ids.push(String(id));
    }
  }
  return ids;
}

// ─── Google Ads (lead form webhook) ──────────────────────

export interface GoogleLeadBody {
  lead_id?: unknown;
  user_column_data?: { column_id?: unknown; column_name?: unknown; string_value?: unknown }[];
  form_id?: unknown;
  campaign_id?: unknown;
  adgroup_id?: unknown;
  creative_id?: unknown;
  gcl_id?: unknown;
  lead_submit_time?: unknown;
  is_test?: unknown;
  google_key?: unknown;
}

const GOOGLE_SLOTS = new Map<string, Slot>([
  ["FULL_NAME", "name"],
  ["PHONE_NUMBER", "phone"],
  ["EMAIL", "email"],
  ["POSTAL_CODE", "zipCode"],
  ["CITY", "city"],
  ["REGION", "state"],
  ["STREET_ADDRESS", "address"],
]);

/** Null when the delivery has no lead id: there's nothing to keep it apart from a retry by. */
export function leadFromGoogle(raw: GoogleLeadBody): LeadIntake | null {
  const leadId = text(raw.lead_id, 170);
  if (!leadId) return null;
  const slots: Partial<Record<Slot, string>> = {};
  const answers: Record<string, string> = {};
  const parts: { FIRST_NAME?: string; LAST_NAME?: string } = {};
  for (const column of raw.user_column_data ?? []) {
    const value = text(column.string_value, 5000);
    if (!value) continue;
    const id = String(column.column_id ?? "");
    const label = text(column.column_name, 120) ?? id;
    const slot = GOOGLE_SLOTS.get(id);
    if (id === "FIRST_NAME" || id === "LAST_NAME") parts[id] = value;
    else if (slot) slots[slot] = value;
    else if (/service/i.test(label) && !slots.service) slots.service = value;
    else if (label) answers[label] = value;
  }
  if (!slots.name) slots.name = [parts.FIRST_NAME, parts.LAST_NAME].filter(Boolean).join(" ");

  // Without the key: it's the webhook's password, and rawPayload is kept.
  const { google_key: _key, ...rawPayload } = raw;
  return {
    ...fit(slots, answers),
    source: "GOOGLE_ADS",
    externalId: leadId,
    pipelineKey: `google-form:${leadId}`,
    pipelineSource: "GoogleForm",
    ...dateOr(raw.lead_submit_time),
    origin: {
      campaignId: text(raw.campaign_id, 100),
      adsetId: text(raw.adgroup_id, 100),
      adId: text(raw.creative_id, 100),
      formId: text(raw.form_id, 100),
      gclid: text(raw.gcl_id),
    },
    rawPayload,
  };
}

// ─── The website form ────────────────────────────────────

const WEBSITE_FIELDS = new Map<string, Slot | "leadId" | keyof LeadOrigin>([
  ["leadid", "leadId"],
  ["id", "leadId"],
  ["nome", "name"],
  ["name", "name"],
  ["fullname", "name"],
  ["nomecompleto", "name"],
  ["telefone", "phone"],
  ["phone", "phone"],
  ["phonenumber", "phone"],
  ["email", "email"],
  ["cep", "zipCode"],
  ["zip", "zipCode"],
  ["zipcode", "zipCode"],
  ["cidade", "city"],
  ["city", "city"],
  ["town", "city"],
  ["servico", "service"],
  ["service", "service"],
  ["servicetype", "service"],
  ["endereco", "address"],
  ["address", "address"],
  ["estado", "state"],
  ["state", "state"],
  ["mensagem", "message"],
  ["message", "message"],
  ["utmsource", "utmSource"],
  ["utmcampaign", "utmCampaign"],
  ["utmcontent", "utmContent"],
  ["gclid", "gclid"],
  ["fbclid", "fbclid"],
]);

const squash = (key: string) =>
  key
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

/**
 * Reads the form's fields, in Portuguese or English. `fallbackId` identifies the delivery when the
 * sender gives no id of its own. Null when there's no way to reach the customer.
 */
export function leadFromWebsite(raw: Record<string, unknown>, fallbackId: string): LeadIntake | null {
  const slots: Partial<Record<Slot, string>> = {};
  const answers: Record<string, string> = {};
  const origin: LeadOrigin = {};
  let leadId: string | undefined;
  for (const [key, value] of Object.entries(raw)) {
    const answer = text(value, 5000);
    if (!answer) continue;
    const field = WEBSITE_FIELDS.get(squash(key));
    if (field === "leadId") leadId = answer.slice(0, 170);
    else if (field && field in SLOT_MAX) slots[field as Slot] = answer;
    else if (field) origin[field as keyof LeadOrigin] = answer.slice(0, 255);
    else answers[key] = answer;
  }
  if (!slots.phone && !slots.email) return null;

  const id = leadId ?? fallbackId;
  return {
    ...fit(slots, answers),
    source: "WEBSITE",
    externalId: id,
    pipelineKey: `website:${id}`,
    pipelineSource: "Website",
    receivedAt: new Date(),
    dated: false,
    origin,
    rawPayload: raw,
  };
}

// ─── ORION and Make (POST /api/orion/leads) ──────────────

export interface OrionLead extends LeadCardFields {
  leadId: string;
  source: "Website" | "Meta" | "Concierge" | "Google";
  receivedAt?: string;
  // The campaign the lead came from, as ORION or the owner's Make scenario names it.
  platform?: string;
  campaignId?: string;
  campaignName?: string;
  adSetId?: string;
  adSetName?: string;
  adId?: string;
  adName?: string;
  formId?: string;
  formName?: string;
}

const ORION_SOURCE: Record<OrionLead["source"], LeadSource> = { Website: "WEBSITE", Concierge: "WEBSITE", Meta: "META", Google: "GOOGLE_ADS" };

// Sent among the form's answers: the ad by the owner's Make scenario, UTMs by a form's hidden fields.
const ORION_ORIGIN = new Map<string, keyof LeadOrigin>([
  ["formid", "formId"],
  ["adid", "adId"],
  ["adname", "adName"],
  ["adsetid", "adsetId"],
  ["campaignid", "campaignId"],
  ["campaignname", "campaignName"],
  ["utmsource", "utmSource"],
  ["utmcampaign", "utmCampaign"],
  ["utmcontent", "utmContent"],
  ["gclid", "gclid"],
  ["fbclid", "fbclid"],
]);

export function leadFromOrion(lead: OrionLead): LeadIntake {
  const { leadId, source, receivedAt, platform, campaignId, campaignName, adSetId, adSetName, adId, adName, formId, formName, ...fields } = lead;
  const origin: LeadOrigin = {};
  // The named fields first; an answer among the details only fills what they left empty.
  const named: Record<keyof LeadOrigin, string | undefined> = {
    platform, campaignId, campaignName, adsetId: adSetId, adsetName: adSetName, adId, adName, formId, formName,
    gclid: undefined, fbclid: undefined, utmSource: undefined, utmCampaign: undefined, utmContent: undefined,
  };
  for (const [key, value] of Object.entries(named) as [keyof LeadOrigin, string | undefined][]) {
    const clean = value?.trim();
    if (clean) origin[key] = clean.slice(0, key.endsWith("Id") ? 100 : 255);
  }
  for (const [label, value] of Object.entries(fields.details ?? {})) {
    const key = ORION_ORIGIN.get(squash(label));
    if (key && !origin[key]) origin[key] = value.slice(0, key.endsWith("Id") ? 100 : 255);
  }
  return {
    ...fields,
    source: ORION_SOURCE[source],
    // Facebook's own id, so the same lead arriving by the Meta webhook is recognized.
    externalId: source === "Meta" ? leadId.replace(/^meta:/, "") : leadId,
    pipelineKey: leadId,
    pipelineSource: source,
    ...dateOr(receivedAt),
    origin,
    rawPayload: lead,
  };
}
