import type { LeadOutcome } from "./orion-lead-outcomes";

export interface FunnelMetrics {
  leads: number;
  validLeads: number;
  qualifiedLeads: number;
  quotedLeads: number;
  wonLeads: number;
  quotedAmount: number;
  wonValue: number;
  validRate: number | null;
  qualificationRate: number | null;
  quoteRate: number | null;
  closeRate: number | null;
}

export interface FunnelGroup extends FunnelMetrics {
  key: string;
  name: string;
  platform: string;
  campaignId?: string;
  adId?: string;
}

const empty = (): FunnelMetrics => ({
  leads: 0,
  validLeads: 0,
  qualifiedLeads: 0,
  quotedLeads: 0,
  wonLeads: 0,
  quotedAmount: 0,
  wonValue: 0,
  validRate: null,
  qualificationRate: null,
  quoteRate: null,
  closeRate: null,
});

function add(metrics: FunnelMetrics, lead: LeadOutcome) {
  metrics.leads += 1;
  if (lead.classification.valid) metrics.validLeads += 1;
  if (lead.classification.qualified) metrics.qualifiedLeads += 1;
  if (lead.classification.quoted) metrics.quotedLeads += 1;
  if (lead.classification.won) metrics.wonLeads += 1;
  metrics.quotedAmount += lead.proposals.sentAmount;
  if (lead.classification.won) metrics.wonValue += lead.job?.value ?? lead.proposals.approvedAmount;
}

function finish<T extends FunnelMetrics>(metrics: T): T {
  metrics.validRate = metrics.leads ? metrics.validLeads / metrics.leads : null;
  metrics.qualificationRate = metrics.validLeads ? metrics.qualifiedLeads / metrics.validLeads : null;
  metrics.quoteRate = metrics.qualifiedLeads ? metrics.quotedLeads / metrics.qualifiedLeads : null;
  metrics.closeRate = metrics.qualifiedLeads ? metrics.wonLeads / metrics.qualifiedLeads : null;
  return metrics;
}

function group(
  leads: LeadOutcome[],
  identify: (lead: LeadOutcome) => Pick<FunnelGroup, "key" | "name" | "platform" | "campaignId" | "adId"> | null,
): FunnelGroup[] {
  const rows = new Map<string, FunnelGroup>();
  for (const lead of leads) {
    const identity = identify(lead);
    if (!identity) continue;
    const row = rows.get(identity.key) ?? { ...empty(), ...identity };
    add(row, lead);
    rows.set(identity.key, row);
  }
  return [...rows.values()].map(finish).sort((a, b) => b.leads - a.leads || b.wonValue - a.wonValue);
}

const platformOf = (lead: LeadOutcome) => lead.attribution?.platform ?? lead.source ?? "Unknown";

/**
 * CRM-side funnel only. Advertising spend remains owned by Google/Meta and is intentionally not
 * guessed here; the marketing app joins spend to these stable campaign/ad IDs to calculate CPL,
 * cost per quote, CAC and ROAS.
 */
export function summarizeMarketingFunnel(leads: LeadOutcome[]) {
  const total = empty();
  for (const lead of leads) add(total, lead);
  return {
    total: finish(total),
    byPlatform: group(leads, (lead) => {
      const platform = platformOf(lead);
      return { key: platform, name: platform, platform };
    }),
    byCampaign: group(leads, (lead) => {
      const id = lead.attribution?.campaignId;
      const name = lead.attribution?.campaignName;
      if (!id && !name) return null;
      const platform = platformOf(lead);
      return { key: `${platform}:${id ?? name}`, name: name ?? id!, platform, campaignId: id };
    }),
    byAd: group(leads, (lead) => {
      const id = lead.attribution?.adId;
      const name = lead.attribution?.adName;
      if (!id && !name) return null;
      const platform = platformOf(lead);
      return { key: `${platform}:${id ?? name}`, name: name ?? id!, platform, campaignId: lead.attribution?.campaignId, adId: id };
    }),
  };
}
