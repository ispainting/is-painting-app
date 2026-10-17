/**
 * Canonical Lead Source options for customer intake.
 *
 * Built from the source buckets already used by business analytics
 * (SOURCE_BUCKETS in business.ts) so dropdown values stay compatible with
 * historical reporting. Historical free-text values are preserved via
 * leadSourceOptionsWithLegacy — never silently replaced or deleted.
 */
export const LEAD_SOURCE_OPTIONS = [
  "Google",
  "Google Business",
  "Facebook",
  "Instagram",
  "Website",
  "Referral",
  "Builder",
  "Repeat Customer",
  "Other",
] as const;

export type LeadSource = (typeof LEAD_SOURCE_OPTIONS)[number];

export const REFERRAL_LEAD_SOURCE: LeadSource = "Referral";

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
