export interface LeadAttribution {
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

const fields = ["platform", "campaignId", "campaignName", "adSetId", "adSetName", "adId", "adName", "formId", "formName"] as const;

export function compactAttribution(input: LeadAttribution): LeadAttribution | null {
  const result: LeadAttribution = {};
  for (const field of fields) {
    const value = input[field]?.trim();
    if (value) result[field] = value;
  }
  return Object.keys(result).length ? result : null;
}

/** A retry may fill a missing field, but never rewrite established attribution. */
export function mergeAttribution(existing: LeadAttribution | null | undefined, incoming: LeadAttribution | null | undefined): LeadAttribution | null {
  const current = compactAttribution(existing ?? {});
  const next = compactAttribution(incoming ?? {});
  if (!current) return next;
  if (!next) return current;
  return compactAttribution({ ...next, ...current });
}

export function attributionFromMetadata(value: unknown): LeadAttribution | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return compactAttribution(Object.fromEntries(fields.map((field) => [field, typeof record[field] === "string" ? record[field] : undefined])) as LeadAttribution);
}
