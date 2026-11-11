import { Prisma, type Lead } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SERVICE_AREA, answeredLines, leadCardNote } from "@/lib/orion-lead-card";
import { attributionOf, isOutOfMap, normalizePhone, normalizeService, type LeadIntake } from "./normalize";
import { notifyNewLead } from "./notify";
import { completeExistingLead, deliverToPipeline, type PipelineCaller, type PipelineLead, type PipelineResult } from "./pipeline";

// The one way a lead comes in, for every door: POST /api/orion/leads (ORION and Make) and the
// webhooks under /api/webhooks. Each lead ends up as one row in the inbox, one card in the pipeline
// and one email, however many doors deliver it and however many times.
//
// - The same id from the same source is the same lead: it can only fill what's still empty.
// - The same phone within 30 days is a repeat of the lead on file: it's counted there, without a new
//   row, card or email.
// - Anything else is a new lead.

const REPEAT_WINDOW_MS = 30 * 86_400_000;
// A re-delivery of an old lead (a backfill, a late retry) goes in the inbox, dated when it arrived,
// but it isn't news to anyone.
const NEWS_WINDOW_MS = 2 * 86_400_000;

export type InboxOutcome = "new" | "known" | "repeat" | "failed";

export interface IntakeResult {
  inbox: InboxOutcome;
  leadId: number | null;
  pipeline: PipelineResult;
}

type Placement = { kind: "new" | "known" | "repeat"; id: number; opportunityId: number | null; serviceType: string | null };

/** For logs: database and API errors can quote the customer's data, so only their code is printed. */
export function errorCode(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  return err instanceof Error ? err.name : "unknown";
}

function leadColumns(intake: LeadIntake) {
  return {
    fullName: intake.name ?? null,
    phone: normalizePhone(intake.phone),
    email: intake.email ?? null,
    serviceType: normalizeService(intake.service),
    city: intake.city ?? null,
    zipCode: intake.zipCode ?? null,
    outOfMap: isOutOfMap(intake.city) || !!intake.details?.[SERVICE_AREA],
    campaignId: intake.origin.campaignId ?? null,
    campaignName: intake.origin.campaignName ?? null,
    adsetId: intake.origin.adsetId ?? null,
    adId: intake.origin.adId ?? null,
    adName: intake.origin.adName ?? null,
    formId: intake.origin.formId ?? null,
    gclid: intake.origin.gclid ?? null,
    fbclid: intake.origin.fbclid ?? null,
    utmSource: intake.origin.utmSource ?? null,
    utmCampaign: intake.origin.utmCampaign ?? null,
    utmContent: intake.origin.utmContent ?? null,
  };
}

// Make often delivers a Facebook lead first, with no ad and few answers, so a later delivery of the
// same lead may complete the row and its card. A repeat is another request, so it fills blanks but
// leaves the card as the first request wrote it. What's already there, and any status someone set,
// never changes.
function blanksToFill(lead: Lead, intake: LeadIntake, sameLead: boolean): Prisma.LeadUpdateInput {
  const fill: Record<string, unknown> = {};
  const columns = leadColumns(intake);
  for (const [key, value] of Object.entries(columns)) {
    if (key === "outOfMap") continue;
    if (value && !lead[key as keyof Lead]) fill[key] = value;
  }
  if (columns.outOfMap && !lead.outOfMap) fill.outOfMap = true;
  const note = leadCardNote(intake);
  if (sameLead && answeredLines(note) > answeredLines(lead.notes)) fill.notes = note;
  return fill;
}

async function placeInInbox(intake: LeadIntake): Promise<Placement> {
  const columns = leadColumns(intake);
  return prisma.$transaction(
    async (tx) => {
      // Two deliveries of one phone at once must not both come out as "new": this lock holds the
      // second until the first has committed, and it ends with the transaction.
      if (columns.phone) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${columns.phone}))`;

      const key = { source: intake.source, externalId: intake.externalId };
      const same = await tx.lead.findUnique({ where: { source_externalId: key } });
      if (same) {
        const fill = blanksToFill(same, intake, true);
        if (Object.keys(fill).length) await tx.lead.update({ where: { id: same.id }, data: fill });
        return { kind: "known", id: same.id, opportunityId: same.opportunityId, serviceType: same.serviceType };
      }

      const repeated = await tx.leadRepeat.findUnique({ where: { source_externalId: key }, select: { lead: { select: { id: true, opportunityId: true, serviceType: true } } } });
      if (repeated) return { kind: "repeat", ...repeated.lead };

      if (columns.phone) {
        const at = intake.receivedAt.getTime();
        const earlier = await tx.lead.findFirst({
          where: { phone: columns.phone, createdAt: { gt: new Date(at - REPEAT_WINDOW_MS), lt: new Date(at + REPEAT_WINDOW_MS) } },
          orderBy: { createdAt: "asc" },
        });
        if (earlier) {
          await tx.leadRepeat.create({ data: { leadId: earlier.id, ...key, receivedAt: intake.receivedAt, rawPayload: intake.rawPayload as Prisma.InputJsonValue } });
          await tx.lead.update({
            where: { id: earlier.id },
            data: { ...blanksToFill(earlier, intake, false), repeatCount: { increment: 1 }, lastRepeatAt: intake.receivedAt },
          });
          return { kind: "repeat", id: earlier.id, opportunityId: earlier.opportunityId, serviceType: earlier.serviceType };
        }
      }

      const lead = await tx.lead.create({
        data: { ...key, ...columns, notes: leadCardNote(intake), rawPayload: intake.rawPayload as Prisma.InputJsonValue, createdAt: intake.receivedAt },
        select: { id: true, opportunityId: true, serviceType: true },
      });
      return { kind: "new", ...lead };
    },
    { maxWait: 8000, timeout: 15000 }
  );
}

/**
 * Records a lead. Throws only when the pipeline card couldn't be saved. `inbox: "failed"` means the
 * inbox row couldn't be saved but the card was: the door decides whether that's worth a retry.
 */
export async function intakeLead(intake: LeadIntake, caller: PipelineCaller): Promise<IntakeResult> {
  let placed: Placement | null = null;
  try {
    placed = await placeInInbox(intake);
  } catch (err) {
    // Two deliveries with no phone racing: the loser's insert hits the unique index and finds the
    // winner on the second try. Anything else must not cost the lead its pipeline card.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") placed = await placeInInbox(intake).catch(() => null);
    if (!placed) console.error("[leads] inbox failed", errorCode(err));
  }

  const { name, email, phone, address, city, state, zipCode, service, message, details } = intake;
  const pipelineLead: PipelineLead = {
    leadId: intake.pipelineKey,
    source: intake.pipelineSource,
    receivedAt: intake.dated ? intake.receivedAt : undefined,
    name, email, phone, address, city, state, zipCode, service, message, details,
    attribution: attributionOf(intake),
  };

  let pipeline: PipelineResult | null = null;
  let pipelineError: unknown = null;
  try {
    // A repeat joins the card the lead already has. Without a card yet (it failed the first time),
    // it's delivered like any other lead so the customer still lands in the pipeline.
    pipeline =
      placed?.kind === "repeat" && placed.opportunityId
        ? { status: "exists", opportunityId: placed.opportunityId, filled: await completeExistingLead(placed.opportunityId, pipelineLead, caller) }
        : await deliverToPipeline(pipelineLead, caller);
  } catch (err) {
    pipelineError = err;
  }

  // Fails when the card was deleted and this is a late delivery of its lead. The lead is delivered
  // all the same: a sender told otherwise would retry forever.
  if (placed && !placed.opportunityId && pipeline) {
    await prisma.lead.update({ where: { id: placed.id }, data: { opportunityId: pipeline.opportunityId } }).catch((err) => console.error("[leads] link to card failed", errorCode(err)));
  }

  // Sent even if the card failed: the row is saved, and a retry would find it "known" and stay quiet.
  if (placed?.kind === "new" && Date.now() - intake.receivedAt.getTime() < NEWS_WINDOW_MS) await notifyNewLead(intake, placed.serviceType);

  if (pipelineError || !pipeline) throw pipelineError ?? new Error("Lead intake failed");
  return { inbox: placed?.kind ?? "failed", leadId: placed?.id ?? null, pipeline };
}
