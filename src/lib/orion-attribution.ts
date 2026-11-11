export interface LeadAttribution {
  platform?: string;
  trafficSource?: string;
  campaignId?: string;
  campaignName?: string;
  adSetId?: string;
  adSetName?: string;
  adId?: string;
  adName?: string;
  formId?: string;
  formName?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  landingPage?: string;
  idealTiming?: string;
  externalLeadId?: string;
}

export const leadAttributionFields = [
  "platform", "trafficSource", "campaignId", "campaignName", "adSetId", "adSetName",
  "adId", "adName", "formId", "formName", "utmSource", "utmMedium", "utmCampaign",
  "utmContent", "gclid", "fbclid", "landingPage", "idealTiming", "externalLeadId",
] as const;

export function compactAttribution(input: LeadAttribution): LeadAttribution | null {
  const result: LeadAttribution = {};
  for (const field of leadAttributionFields) {
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
  return compactAttribution(Object.fromEntries(leadAttributionFields.map((field) => [field, typeof record[field] === "string" ? record[field] : undefined])) as LeadAttribution);
}

const noteLabels: Record<string, keyof LeadAttribution> = {
  "traffic source": "trafficSource",
  "utm source": "utmSource",
  "utm medium": "utmMedium",
  "utm campaign": "utmCampaign",
  "utm content": "utmContent",
  gclid: "gclid",
  fbclid: "fbclid",
  "landing page": "landingPage",
  "ideal timing": "idealTiming",
  "campaign id": "campaignId",
  campaign: "campaignName",
  "ad set id": "adSetId",
  "ad set": "adSetName",
  "ad id": "adId",
  ad: "adName",
  "form id": "formId",
  form: "formName",
};

/** Reads historical lead-card lines without changing the original Notes text. */
export function attributionFromLeadNote(note: string | null | undefined): LeadAttribution | null {
  if (!note) return null;
  const result: LeadAttribution = {};
  for (const line of note.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const field = noteLabels[key];
    const value = line.slice(separator + 1).trim();
    if (field && value && !/^not provided$/i.test(value)) result[field] = value;
  }
  return compactAttribution(result);
}
