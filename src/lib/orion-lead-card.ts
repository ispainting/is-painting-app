// A lead's card: everything the customer filled in on the form, in the order the sales team needs
// it (town before service, CLAUDE.md hard rule 3). A question left blank says so, it is never
// guessed. The card is what POST /api/orion/leads writes to the opportunity and the customer's
// notes, and the rest of this file decides what a later delivery of the same lead may fill in.

export const NOT_PROVIDED = "Not provided";
const SERVICE_AREA = "Service area";

export interface LeadCardFields {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  service?: string;
  message?: string;
  details?: Record<string, string>;
}

export interface CustomerContact {
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

// Facebook hands back an answer's internal key ("cabinet_painting_/_refinishing") and Make forwards
// it as is. Text a person typed has spaces or capitals and is left alone, and so is a link.
export function readable(value: string): string {
  const text = value.trim();
  if (/[\sA-Z@]|:\/\//.test(text)) return text;
  const words = text.replace(/(\d)_(\d)/g, "$1-$2").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function leadCardLines(lead: LeadCardFields): string[] {
  const line = (label: string, value: string | undefined) => `${label}: ${value?.trim() || NOT_PROVIDED}`;
  // ORION flags a town outside the service map; that belongs next to the town, not below the answers.
  const { [SERVICE_AREA]: serviceArea, ...others } = lead.details ?? {};
  return [
    line("Town", lead.city),
    ...(serviceArea ? [line(SERVICE_AREA, serviceArea)] : []),
    line("Service", lead.service && readable(lead.service)),
    line("Name", lead.name),
    line("Phone", lead.phone),
    line("Email", lead.email),
    line("ZIP", lead.zipCode),
    // Most forms don't ask these, so they appear only when the customer gave them.
    ...(lead.address ? [line("Address", lead.address)] : []),
    ...(lead.state ? [line("State", lead.state)] : []),
    ...(lead.message ? [line("Message", lead.message)] : []),
    ...Object.entries(others).map(([label, value]) => line(readable(label), value)),
  ];
}

export function leadCardNote(lead: LeadCardFields): string {
  return leadCardLines(lead).join("\n");
}

export function leadService(lead: Pick<LeadCardFields, "service">): string | null {
  return lead.service?.trim() ? readable(lead.service) : null;
}

export function leadOpportunityName(lead: Pick<LeadCardFields, "name" | "service" | "city">): string {
  const name = lead.name?.trim();
  const service = leadService(lead);
  if (name) return `${name} - ${service ?? "Quote request"}`;
  return [service ?? "Quote request", lead.city?.trim()].filter(Boolean).join(" — ");
}

export function customerTagsWithService(tags: string[] | null | undefined, lead: Pick<LeadCardFields, "service">): string[] {
  const current = (tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const service = leadService(lead);
  if (!service || current.some((tag) => tag.toLocaleLowerCase() === service.toLocaleLowerCase())) return current;
  return [...current, service];
}

/** What a later delivery can add to the customer: only fields that are still empty. */
export function blankCustomerFields(customer: CustomerContact, lead: LeadCardFields): Partial<CustomerContact> {
  const fill: Partial<CustomerContact> = {};
  for (const key of ["email", "phone", "address", "city", "state", "zipCode"] as const) {
    const value = lead[key];
    if (value && !customer[key]?.trim()) fill[key] = value;
  }
  return fill;
}

function answeredLines(note: string | null): number {
  return (note ?? "").split("\n").filter((line) => line.includes(":") && !line.endsWith(`: ${NOT_PROVIDED}`)).length;
}

/**
 * Whether a later delivery's card replaces the one on file. The opportunity's note and its first
 * touchpoint start identical, so once they differ someone has edited one of them, and a person's
 * words are never overwritten. A card with fewer answers doesn't replace a fuller one either.
 */
export function replacesNote(current: string | null, touchpointBody: string | null, incoming: string): boolean {
  if (current !== touchpointBody || current === incoming) return false;
  return answeredLines(incoming) >= answeredLines(current);
}

/** A better title for the opportunity, or null to keep it: only the automatic title ever changes. */
export function betterOpportunityName(current: string, lead: Pick<LeadCardFields, "name" | "service" | "city">): string | null {
  const next = leadOpportunityName(lead);
  if (next === current) return null;

  const service = leadService(lead);
  const city = lead.city?.trim();
  const automaticNames = new Set([
    "Quote request",
    ...(service ? [service] : []),
    ...(service && city ? [`${service} — ${city}`] : []),
  ]);
  if (!automaticNames.has(current)) return null;
  return next;
}
