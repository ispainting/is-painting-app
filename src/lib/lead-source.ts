/**
 * Canonical Lead Source options for customer intake.
 *
 * Historical free-text values are preserved via leadSourceOptionsWithLegacy —
 * never silently replaced or deleted — and normalizeLeadSourceForReport maps
 * known legacy variants onto these canonical labels for reporting.
 */
export const LEAD_SOURCE_OPTIONS = [
  "LSA",
  "Google Ads",
  "Google Search",
  "Meta Ads",
  "Angi Leads",
  "Website",
  "ChatGPT",
  "Builder",
  "Referral",
  "Repeated Customer",
  "Other",
  "Unknown",
] as const;

export type LeadSource = (typeof LEAD_SOURCE_OPTIONS)[number];

export const REFERRAL_LEAD_SOURCE: LeadSource = "Referral";

export const UNKNOWN_LEAD_SOURCE = "Unknown";

export const SERVICE_TYPE_OPTIONS = [
  "Interior",
  "Exterior",
  "Both",
  "Commercial",
  "Other",
] as const;

export function serviceTypeOptionsWithLegacy(current: string | null | undefined): string[] {
  const value = (current ?? "").trim();
  if (!value || (SERVICE_TYPE_OPTIONS as readonly string[]).includes(value)) return [...SERVICE_TYPE_OPTIONS];
  return [value, ...SERVICE_TYPE_OPTIONS];
}

/** Legacy/historical aliases → canonical labels. Keys are lowercase. */
const LEGACY_SOURCE_MAP: Record<string, LeadSource> = {
  lsa: "LSA",
  "google local services": "LSA",
  "google local services ads": "LSA",
  "local services ads": "LSA",
  "local service ads": "LSA",
  google: "Google Ads",
  "google ads": "Google Ads",
  "google adwords": "Google Ads",
  adwords: "Google Ads",
  ppc: "Google Ads",
  "google business": "Google Search",
  "google business profile": "Google Search",
  "google search": "Google Search",
  angi: "Angi Leads",
  "angi leads": "Angi Leads",
  facebook: "Meta Ads",
  "facebook ads": "Meta Ads",
  instagram: "Meta Ads",
  "instagram ads": "Meta Ads",
  meta: "Meta Ads",
  "meta ads": "Meta Ads",
  website: "Website",
  chatgpt: "ChatGPT",
  "chat gpt": "ChatGPT",
  chatgbt: "ChatGPT",
  openai: "ChatGPT",
  gpt: "ChatGPT",
  builder: "Builder",
  referral: "Referral",
  "repeat customer": "Repeated Customer",
  "repeated customer": "Repeated Customer",
  "repeat_customer": "Repeated Customer",
  "existing customer": "Repeated Customer",
  "returning customer": "Repeated Customer",
  other: "Other",
};

/**
 * Normalizes a source for reporting: canonical labels pass through, known
 * legacy aliases map onto canonical labels, empty becomes "Unknown", and
 * unrecognized legacy values stay visible as their own bucket — never
 * silently rewritten.
 */
export function normalizeLeadSourceForReport(source: string | null | undefined): string {
  const value = (source ?? "").trim();
  if (!value) return UNKNOWN_LEAD_SOURCE;
  if ((LEAD_SOURCE_OPTIONS as readonly string[]).includes(value)) return value;
  const mapped = LEGACY_SOURCE_MAP[value.toLowerCase()];
  if (mapped) return mapped;
  if (value.toLowerCase().includes("referr")) return "Referral";
  return value;
}

export function isReferralSource(source: string | null | undefined): boolean {
  return (source ?? "").trim() === REFERRAL_LEAD_SOURCE;
}

/**
 * Dropdown options including the customer's current value when it is a
 * historical free-text entry not in the canonical list, so editing never
 * silently drops it.
 */
export function leadSourceOptionsWithLegacy(current: string | null | undefined): string[] {
  const value = (current ?? "").trim();
  if (!value) return [...LEAD_SOURCE_OPTIONS];
  if ((LEAD_SOURCE_OPTIONS as readonly string[]).includes(value)) return [...LEAD_SOURCE_OPTIONS];
  return [value, ...LEAD_SOURCE_OPTIONS];
}

/**
 * Referral Name is only meaningful when Lead Source is Referral.
 */
export function resolveReferralName(leadSource: string | null | undefined, referralName: string | null | undefined): string | undefined {
  if (!isReferralSource(leadSource)) return undefined;
  const trimmed = (referralName ?? "").trim();
  return trimmed || undefined;
}
