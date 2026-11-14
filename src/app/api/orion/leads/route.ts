import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkLeadIntakeAuth, classifyWordPressLead, type LeadIntakeCaller } from "@/lib/orion-auth";
import { betterOpportunityName, blankCustomerFields, customerTagsWithService, leadCardNote, leadOpportunityName, leadService, replacesNote } from "@/lib/orion-lead-card";
import { attributionFromMetadata, compactAttribution, mergeAttribution, type LeadAttribution } from "@/lib/orion-attribution";

// Lead intake from ORION, the marketing platform. Every quote request it receives — the website
// form, the site's chat concierge, a Facebook instant form — is posted here and lands in the sales
// pipeline as a new lead, so nobody retypes it.
//
// - Idempotent: the same leadId always maps to the same opportunity (MigrationMap row
//   "orion_lead"), so retries and backfills never duplicate.
// - A later delivery of the same lead can only add: it fills empty contact fields and upgrades the
//   automatic card (src/lib/orion-lead-card.ts). Make usually delivers a Facebook lead first, with
//   whatever its scenario maps, so ORION's fuller delivery has to be able to complete it.
// - Matches an existing customer by email, then by phone, before creating one, so a returning
//   client gets a new opportunity on their own record.
// - Same shape the admin "new opportunity" action writes (stage new_lead, sales pipeline); no
//   automations are triggered here, exactly like that action.
//
// Server-to-server bearer authentication and the WordPress key's scope are in src/lib/orion-auth.ts.
// Accepts JSON or form fields (application/x-www-form-urlencoded), so a Make HTTP module can send
// plain key/value fields without hand-building JSON.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAP_TYPE = "orion_lead";

const LeadInput = z.object({
  leadId: z.string().min(1).max(191),
  source: z.enum(["Website", "Meta", "Concierge", "Google"]),
  // Any date the platforms send ("2026-10-16T15:44:26+0000" from Meta via Make, ISO from ORION);
  // missing means "now".
  receivedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "not a date")
    .optional(),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  zipCode: z.string().trim().max(20).optional(),
  service: z.string().trim().max(120).optional(),
  message: z.string().trim().max(5000).optional(),
  platform: z.string().trim().max(100).optional(),
  campaignId: z.string().trim().max(191).optional(),
  campaignName: z.string().trim().max(300).optional(),
  adSetId: z.string().trim().max(191).optional(),
  adSetName: z.string().trim().max(300).optional(),
  adId: z.string().trim().max(191).optional(),
  adName: z.string().trim().max(300).optional(),
  formId: z.string().trim().max(191).optional(),
  formName: z.string().trim().max(300).optional(),
  trafficSource: z.string().trim().max(100).optional(),
  utmSource: z.string().trim().max(300).optional(),
  utmMedium: z.string().trim().max(300).optional(),
  utmCampaign: z.string().trim().max(300).optional(),
  utmContent: z.string().trim().max(500).optional(),
  gclid: z.string().trim().max(500).optional(),
  fbclid: z.string().trim().max(500).optional(),
  landingPage: z.string().trim().max(1000).optional(),
  idealTiming: z.string().trim().max(300).optional(),
  // Any other answers from the form, label → value, kept on the lead's first note.
  details: z.record(z.string().max(5000)).optional(),
});
type LeadInput = z.infer<typeof LeadInput>;

const KNOWN_FIELDS = new Set(["leadId", "source", "receivedAt", "name", "email", "phone", "address", "city", "state", "zipCode", "service", "message", "platform", "campaignId", "campaignName", "adSetId", "adSetName", "adId", "adName", "formId", "formName", "trafficSource", "utmSource", "utmMedium", "utmCampaign", "utmContent", "gclid", "fbclid", "landingPage", "idealTiming", "details"]);

// The owner's Make scenario already shapes each Facebook lead for Viktor ("Lead ID", "Created time",
// "Full name", "Phone", "Email", "Service", "Form ID", "Ad ID"). Accepting those names lets the CRM
// step be a copy of the Viktor step with only the URL and key changed. Keys are compared without
// case, spaces, underscores or dashes.
const ALIASES: Record<string, string> = {
  leadid: "leadId",
  createdtime: "receivedAt",
  datecreated: "receivedAt",
  receivedat: "receivedAt",
  fullname: "name",
  name: "name",
  phone: "phone",
  phonenumber: "phone",
  email: "email",
  service: "service",
  servicetype: "service",
  city: "city",
  town: "city",
  state: "state",
  zip: "zipCode",
  zipcode: "zipCode",
  projectzipcode: "zipCode",
  postcode: "zipCode",
  streetaddress: "address",
  address: "address",
  message: "message",
  source: "source",
  platform: "platform",
  campaignid: "campaignId",
  campaignname: "campaignName",
  campaign: "campaignName",
  adsetid: "adSetId",
  adsetname: "adSetName",
  adid: "adId",
  adname: "adName",
  formid: "formId",
  formname: "formName",
  trafficsource: "trafficSource",
  utmsource: "utmSource",
  utmmedium: "utmMedium",
  utmcampaign: "utmCampaign",
  utmcontent: "utmContent",
  gclid: "gclid",
  fbclid: "fbclid",
  landingpage: "landingPage",
  idealtiming: "idealTiming",
  details: "details",
};
// Fields only a Facebook lead carries — their presence means the source is Meta.
const META_ONLY = new Set(["formid", "adid"]);
const squash = (key: string) => key.toLowerCase().replace(/[\s_-]+/g, "");

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "").trim();
}

// Same lead, same key, whoever delivers it: ORION sends "meta:<leadgen id>", and a Make scenario
// that maps Facebook's bare lead id gets the same prefix here, so the two never make two leads.
function normalizeLeadId(leadId: string, source: string): string {
  const id = leadId.trim();
  if (/^\d+$/.test(id) && source === "Meta") return `meta:${id}`;
  if (/^\d+$/.test(id) && source === "Google") return `google:${id}`;
  return id;
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const type = req.headers.get("content-type") ?? "";
  let raw: Record<string, unknown> | null;
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    raw = form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : null;
  } else {
    raw = await req.json().catch(() => null);
  }
  if (!raw || typeof raw !== "object") return null;
  // Automation tools send unmapped fields as "" — treat those as missing. Unknown fields (extra
  // form questions) are kept as details.
  const body: Record<string, unknown> = {};
  const details: Record<string, string> = {};
  let looksLikeFacebook = false;
  for (const [key, value] of Object.entries(raw)) {
    const field = KNOWN_FIELDS.has(key) ? key : ALIASES[squash(key)];
    if (field === "details" && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) if (asText(v)) details[k] = asText(v);
      continue;
    }
    const text = asText(value);
    if (!text) continue;
    if (META_ONLY.has(squash(key))) looksLikeFacebook = true;
    if (field && field !== "details") body[field] = text;
    else details[key] = text;
  }
  if (!body.source && looksLikeFacebook) body.source = "Meta";
  if (Object.keys(details).length) body.details = details;
  if (typeof body.leadId === "string" && typeof body.source === "string") body.leadId = normalizeLeadId(body.leadId, body.source);
  return body;
}

const CRM_SOURCE: Record<LeadInput["source"], { leadSource: string; source: string; label: string }> = {
  Website: { leadSource: "Website", source: "Website form", label: "website form" },
  Concierge: { leadSource: "Website", source: "Website chat", label: "website chat" },
  Meta: { leadSource: "Meta", source: "Facebook form", label: "Facebook form" },
  Google: { leadSource: "Google", source: "Google Local Services", label: "Google" },
};

const digits = (value: string) => value.replace(/\D/g, "").slice(-10);

function leadAttribution(lead: LeadInput): LeadAttribution | null {
  return compactAttribution({
    platform: lead.platform ?? (lead.source === "Meta" ? "Meta" : lead.source === "Google" ? "Google" : undefined),
    campaignId: lead.campaignId,
    campaignName: lead.campaignName,
    adSetId: lead.adSetId,
    adSetName: lead.adSetName,
    adId: lead.adId,
    adName: lead.adName,
    formId: lead.formId,
    formName: lead.formName,
    trafficSource: lead.trafficSource,
    utmSource: lead.utmSource,
    utmMedium: lead.utmMedium,
    utmCampaign: lead.utmCampaign,
    utmContent: lead.utmContent,
    gclid: lead.gclid,
    fbclid: lead.fbclid,
    landingPage: lead.landingPage,
    idealTiming: lead.idealTiming,
    externalLeadId: lead.leadId,
  });
}

async function preserveAttribution(opportunityId: number, customerId: number, lead: LeadInput, occurredAt: Date) {
  const incoming = leadAttribution(lead);
  if (!incoming) return false;
  const existing = await prisma.customerTouchpoint.findFirst({
    where: { customerId, deletedAt: null, subject: "Marketing attribution", metadata: { path: ["opportunityId"], equals: opportunityId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, metadata: true },
  });
  if (existing) {
    const current = attributionFromMetadata(existing.metadata);
    const merged = mergeAttribution(current, incoming);
    if (JSON.stringify(current) !== JSON.stringify(merged)) {
      const base = existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
        ? existing.metadata as Record<string, unknown>
        : {};
      await prisma.customerTouchpoint.update({ where: { id: existing.id }, data: { metadata: { ...base, ...merged } } });
      return true;
    }
    return false;
  }
  await prisma.customerTouchpoint.create({
    data: {
      customerId,
      type: "note",
      subject: "Marketing attribution",
      body: "Campaign attribution captured automatically.",
      occurredAt,
      metadata: { type: "marketing_attribution", source: lead.source, leadId: lead.leadId, opportunityId, ...incoming },
    },
  });
  return true;
}

async function findCustomer(lead: LeadInput) {
  if (lead.email) {
    const byEmail = await prisma.customer.findFirst({
      where: { deletedAt: null, email: { equals: lead.email, mode: "insensitive" } },
      select: { id: true, tags: true },
    });
    if (byEmail) return byEmail;
  }
  const phone = lead.phone ? digits(lead.phone) : "";
  if (phone.length >= 7) {
    // Phones are stored as typed ("(508) 555-0100", "508.555.0100"), so narrow by the last four
    // digits in SQL and compare the full number in code.
    const candidates = await prisma.customer.findMany({
      where: { deletedAt: null, phone: { contains: phone.slice(-4) } },
      select: { id: true, phone: true, tags: true },
      take: 50,
    });
    const match = candidates.find((c) => c.phone && digits(c.phone) === phone);
    if (match) return { id: match.id, tags: match.tags };
  }
  return null;
}

// A repeat delivery of a lead already on file. Contact fields only ever go from empty to filled.
// The card and title are ORION's to upgrade, for the same reason only ORION may re-date (below):
// Make's copy of a Facebook lead is the thinner one, and it can arrive after ORION's.
async function completeExistingLead(opportunityId: number, lead: LeadInput, caller: LeadIntakeCaller | null): Promise<string[]> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { name: true, notes: true, serviceType: true, customerId: true, customer: { select: { email: true, phone: true, address: true, city: true, state: true, zipCode: true, tags: true } } },
  });
  if (!opportunity) return [];

  const contact = blankCustomerFields(opportunity.customer, lead);
  const filled = Object.keys(contact);
  const note = leadCardNote(lead);
  const touchpoint =
    caller === "ORION"
      ? await prisma.customerTouchpoint.findFirst({
          where: { customerId: opportunity.customerId, type: "note", metadata: { path: ["leadId"], equals: lead.leadId } },
          orderBy: { createdAt: "asc" },
          select: { id: true, body: true },
        })
      : null;
  const newNote = !!touchpoint && replacesNote(opportunity.notes, touchpoint.body, note);
  const newName = betterOpportunityName(opportunity.name, lead);
  const serviceType = !opportunity.serviceType ? leadService(lead) : null;
  const tags = customerTagsWithService(opportunity.customer.tags, lead);
  const tagsChanged = JSON.stringify(tags) !== JSON.stringify(opportunity.customer.tags ?? []);
  if (newNote) filled.push("card");
  if (newName) filled.push("title");
  if (serviceType) filled.push("serviceType");
  if (tagsChanged) filled.push("serviceTag");
  if (filled.length === 0) return [];

  await prisma.$transaction(async (tx) => {
    if (Object.keys(contact).length || tagsChanged) await tx.customer.update({ where: { id: opportunity.customerId }, data: { ...contact, ...(tagsChanged ? { tags } : {}) } });
    if (newNote || newName || serviceType) await tx.opportunity.update({ where: { id: opportunityId }, data: { ...(newNote ? { notes: note } : {}), ...(newName ? { name: newName } : {}), ...(serviceType ? { serviceType } : {}) } });
    if (newNote && touchpoint) await tx.customerTouchpoint.update({ where: { id: touchpoint.id }, data: { body: note } });
  });
  return filled;
}

export async function POST(req: Request) {
  const { result: auth, caller } = checkLeadIntakeAuth(req);
  if (auth === "unconfigured") {
    console.error("[api/orion/leads] no lead intake credential is configured");
    return NextResponse.json({ error: "ORION access is not configured" }, { status: 503 });
  }
  if (auth === "denied") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = LeadInput.safeParse(await readBody(req));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead", issues: parsed.error.issues }, { status: 400 });
  const lead = parsed.data;

  // WordPress has a distinct check ID. Meta's testing tool instead puts dummy markers in fields.
  if (caller === "WordPress") {
    const kind = classifyWordPressLead(lead);
    if (kind === "denied") return NextResponse.json({ error: "Outside WordPress quote scope" }, { status: 403 });
    if (kind === "check") return NextResponse.json({ status: "test_ok" });
  } else if ([lead.name, lead.email, ...Object.values(lead.details ?? {})].some((v) => v && /dummy data|test lead/i.test(v))) {
    return NextResponse.json({ status: "test_ok", message: "Connection works — test lead not saved." });
  }

  const receivedAt = lead.receivedAt ? new Date(lead.receivedAt) : new Date();
  const existing = await prisma.migrationMap.findUnique({ where: { entityType_legacyId: { entityType: MAP_TYPE, legacyId: lead.leadId } } });
  if (existing) {
    // An ORION lead's opportunity is dated when the request arrived (see below); a re-send from
    // ORION also corrected the first backfill, which was stamped with the import time. Only ORION
    // may re-date: a Make delivery of a lead ORION already pulled must never move its date.
    if (caller === "ORION" && lead.receivedAt) {
      await prisma.opportunity.updateMany({ where: { id: existing.newId, leadReceivedAt: { not: receivedAt } }, data: { leadReceivedAt: receivedAt } });
    }
    const filled = await completeExistingLead(existing.newId, lead, caller);
    const mapped = await prisma.opportunity.findUnique({ where: { id: existing.newId }, select: { customerId: true } });
    const attributionAdded = mapped ? await preserveAttribution(existing.newId, mapped.customerId, lead, receivedAt) : false;
    return NextResponse.json({ status: "exists", opportunityId: existing.newId, filled, attributionAdded });
  }

  const matched = await findCustomer(lead);
  const body = leadCardNote(lead);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customerId =
        matched?.id ??
        (
          await tx.customer.create({
            data: {
              name: lead.name || lead.email || lead.phone || `${CRM_SOURCE[lead.source].label} lead`,
              email: lead.email,
              phone: lead.phone,
              address: lead.address,
              city: lead.city,
              state: lead.state,
              zipCode: lead.zipCode,
              leadSource: CRM_SOURCE[lead.source].leadSource,
              source: CRM_SOURCE[lead.source].source,
              status: "Lead",
              tags: customerTagsWithService([], lead),
              lastContactAt: receivedAt,
              createdAt: receivedAt,
            },
            select: { id: true },
          })
        ).id;

      if (matched) {
        const tags = customerTagsWithService(matched.tags, lead);
        if (JSON.stringify(tags) !== JSON.stringify(matched.tags ?? [])) {
          await tx.customer.update({ where: { id: customerId }, data: { tags } });
        }
      }

      const opportunity = await tx.opportunity.create({
        data: {
          customerId,
          name: leadOpportunityName(lead),
          pipeline: "sales",
          stage: "new_lead",
          status: "open",
          source: CRM_SOURCE[lead.source].leadSource,
          serviceType: leadService(lead),
          notes: body,
          leadReceivedAt: receivedAt,
          lastStageChangedAt: receivedAt,
          // Dated when the request arrived, not when it reached the CRM, so "leads this month" and
          // the source breakdowns count it in the right month even when it was delivered later.
          createdAt: receivedAt,
          stageHistory: {
            create: {
              newStage: "new_lead",
              effectiveAt: receivedAt,
              reason: "Initial lead received",
            },
          },
        },
        select: { id: true },
      });

      await tx.customerTouchpoint.create({
        data: {
          customerId,
          type: "note",
          subject: `Quote request received (${CRM_SOURCE[lead.source].label})`,
          body,
          occurredAt: receivedAt,
          metadata: { via: caller, leadId: lead.leadId, opportunityId: opportunity.id, type: "lead_intake" },
        },
      });

      const attribution = leadAttribution(lead);
      if (attribution) {
        await tx.customerTouchpoint.create({
          data: {
            customerId,
            type: "note",
            subject: "Marketing attribution",
            body: "Campaign attribution captured automatically.",
            occurredAt: receivedAt,
            metadata: { type: "marketing_attribution", source: lead.source, leadId: lead.leadId, opportunityId: opportunity.id, ...attribution },
          },
        });
      }

      await tx.migrationMap.create({ data: { entityType: MAP_TYPE, legacyId: lead.leadId, newId: opportunity.id } });
      return { opportunityId: opportunity.id, customerId };
    });

    return NextResponse.json({ status: "created", customerMatched: !!matched, ...result }, { status: 201 });
  } catch (err) {
    // Two deliveries of the same lead racing: the loser's MigrationMap insert hits the unique
    // index, its whole transaction rolls back, and the winner's opportunity is the answer.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.migrationMap.findUnique({ where: { entityType_legacyId: { entityType: MAP_TYPE, legacyId: lead.leadId } } });
      if (winner) return NextResponse.json({ status: "exists", opportunityId: winner.newId });
    }
    console.error("[api/orion/leads] intake failed", err);
    return NextResponse.json({ error: "Lead intake failed" }, { status: 500 });
  }
}
