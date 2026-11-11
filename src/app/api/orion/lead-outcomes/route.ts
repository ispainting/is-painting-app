import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkReadAuth } from "@/lib/orion-auth";
import { buildLeadOutcomes } from "@/lib/orion-lead-outcomes";
import { attributionFromMetadata, mergeAttribution, type LeadAttribution } from "@/lib/orion-attribution";
import { summarizeMarketingFunnel } from "@/lib/orion-marketing-funnel";

// Per-lead outcomes for ORION, the marketing platform: for every lead that arrived through
// POST /api/orion/leads (ORION or Make), its pipeline stage, the proposals sent to that customer
// afterwards and the job it became. This is what lets ORION connect an ad → lead → proposal →
// contract. Same privacy line as /api/orion/summary: ids, stages, cities, dates and amounts only —
// never a customer's name, phone, email or address.
//
// Auth: `Authorization: Bearer <ORION_API_SECRET or VIKTOR_API_SECRET>` (read-only, see
// src/lib/orion-auth.ts). `?days=` picks the window by when the lead arrived (default 90, max 365).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAP_TYPE = "orion_lead"; // same entity type POST /api/orion/leads writes

export async function GET(req: Request) {
  const auth = checkReadAuth(req);
  if (auth === "unconfigured") {
    console.error("[api/orion/lead-outcomes] neither ORION_API_SECRET nor VIKTOR_API_SECRET is set — refusing to serve business data");
    return NextResponse.json({ error: "ORION access is not configured" }, { status: 503 });
  }
  if (auth === "denied") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = Number(new URL(req.url).searchParams.get("days") ?? 90);
  const days = Number.isFinite(requested) ? Math.min(Math.max(Math.round(requested), 1), 365) : 90;
  const since = new Date(Date.now() - days * 86_400_000);

  const maps = await prisma.migrationMap.findMany({ where: { entityType: MAP_TYPE }, select: { legacyId: true, newId: true } });
  const opportunities = await prisma.opportunity.findMany({
    where: {
      id: { in: maps.map((m) => m.newId) },
      OR: [{ leadReceivedAt: { gte: since } }, { leadReceivedAt: null, createdAt: { gte: since } }],
    },
    select: {
      id: true,
      customerId: true,
      stage: true,
      status: true,
      source: true,
      serviceType: true,
      outcomeAt: true,
      outcomeReason: true,
      archivedAt: true,
      createdAt: true,
      leadReceivedAt: true,
      lastStageChangedAt: true,
      customer: { select: { city: true } },
      stageHistory: {
        select: { previousStage: true, newStage: true, effectiveAt: true, reason: true },
        orderBy: [{ effectiveAt: "asc" as const }, { id: "asc" as const }],
      },
      job: { select: { status: true, contractAmount: true, totalEstimate: true } },
    },
  });
  const proposals = await prisma.proposal.findMany({
    where: { customerId: { in: [...new Set(opportunities.map((o) => o.customerId))] }, deletedAt: null },
    select: { customerId: true, status: true, totalAmount: true, sentAt: true, approvedAt: true, createdAt: true },
  });
  const touchpoints = await prisma.customerTouchpoint.findMany({
    where: { customerId: { in: [...new Set(opportunities.map((o) => o.customerId))] }, deletedAt: null },
    select: { metadata: true },
  });
  const attribution = new Map<number, LeadAttribution>();
  for (const touchpoint of touchpoints) {
    if (!touchpoint.metadata || typeof touchpoint.metadata !== "object" || Array.isArray(touchpoint.metadata)) continue;
    const metadata = touchpoint.metadata as Record<string, unknown>;
    const opportunityId = typeof metadata.opportunityId === "number" ? metadata.opportunityId : Number(metadata.opportunityId);
    const row = attributionFromMetadata(metadata);
    if (!Number.isInteger(opportunityId) || !row) continue;
    const merged = mergeAttribution(attribution.get(opportunityId), row);
    if (merged) attribution.set(opportunityId, merged);
  }

  const leads = buildLeadOutcomes(
    maps,
    opportunities.map(({ customer, ...o }) => ({ ...o, city: customer.city })),
    proposals,
    attribution,
  );
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    currency: "USD",
    window: { days, since: since.toISOString() },
    funnel: summarizeMarketingFunnel(leads),
    leads,
    guardrails: {
      advertisingChangesRequireApproval: true,
      crmIsReadOnlyForMarketingAnalysis: true,
      spendMustComeFromAdvertisingPlatforms: true,
    },
  });
}
