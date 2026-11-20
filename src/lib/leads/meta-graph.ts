import type { MetaGraphLead } from "./normalize";

// Meta's webhook only says which lead arrived; its answers and its ad come from the Graph API.
// META_GRAPH_BASE_URL exists so scripts/simulate-leads.ts can answer locally.
const GRAPH_BASE = () => process.env.META_GRAPH_BASE_URL || "https://graph.facebook.com/v21.0";
const FIELDS = "created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id";

export async function fetchMetaLead(leadgenId: string): Promise<MetaGraphLead> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error("META_PAGE_ACCESS_TOKEN is not set");
  if (!/^\d+$/.test(leadgenId)) throw new Error("leadgen id is not a number");

  const res = await fetch(`${GRAPH_BASE()}/${leadgenId}?fields=${FIELDS}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    // Only Meta's error code: its message can quote what was asked for.
    const body = (await res.json().catch(() => null)) as { error?: { code?: number; error_subcode?: number } } | null;
    throw new Error(`Graph API answered ${res.status} (code ${body?.error?.code ?? "?"}/${body?.error?.error_subcode ?? "?"})`);
  }
  return { ...((await res.json()) as MetaGraphLead), id: leadgenId };
}
