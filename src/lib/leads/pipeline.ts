import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { attributionFromMetadata, mergeAttribution, type LeadAttribution } from "@/lib/orion-attribution";
import { betterOpportunityName, blankCustomerFields, leadCardNote, leadOpportunityName, replacesNote, type LeadCardFields } from "@/lib/orion-lead-card";
import type { PipelineSource } from "./normalize";

// Puts a lead in the sales pipeline as a card, whichever door it came through.
//
// - Idempotent: the same key always maps to the same opportunity (MigrationMap row "orion_lead"), so
//   retries and backfills never duplicate.
// - A later delivery of the same lead can only add: it fills empty contact fields and upgrades the
//   automatic card (src/lib/orion-lead-card.ts). Make usually delivers a Facebook lead first, with
//   whatever its scenario maps, so a fuller delivery has to be able to complete it.
// - Matches an existing customer by email, then by phone, before creating one, so a returning
//   client gets a new opportunity on their own record.
// - Same shape the admin "new opportunity" action writes (stage new_lead, sales pipeline); no
//   automations are triggered here, exactly like that action.

const MAP_TYPE = "orion_lead";

/** Who delivered the lead. A webhook carries the platform's whole form, so it may upgrade the card.
 *  WordPress (the Coastal quote form's own key, src/lib/orion-auth.ts) is treated like Make: it
 *  never re-dates a lead nor upgrades a card ORION already filled. */
export type PipelineCaller = "ORION" | "Make" | "WordPress" | "Webhook" | null;

export interface PipelineLead extends LeadCardFields {
  leadId: string;
  source: PipelineSource;
  /** Left out when the delivery carried no date: the card is then dated "now" and never re-dated. */
  receivedAt?: Date;
  /** The campaign, ad set, ad and form the lead came from, read by ORION's lead outcomes. */
  attribution?: LeadAttribution | null;
}

export type PipelineResult =
  | { status: "created"; customerMatched: boolean; opportunityId: number; customerId: number }
  | { status: "exists"; opportunityId: number; filled?: string[]; attributionAdded?: boolean };

const CRM_SOURCE: Record<PipelineSource, { leadSource: string; source: string; label: string }> = {
  Website: { leadSource: "Website", source: "Website form", label: "website form" },
  Concierge: { leadSource: "Website", source: "Website chat", label: "website chat" },
  Meta: { leadSource: "Meta", source: "Facebook form", label: "Facebook form" },
  Google: { leadSource: "Google", source: "Google Local Services", label: "Google" },
  GoogleForm: { leadSource: "Google", source: "Google Ads form", label: "Google Ads form" },
};

const digits = (value: string) => value.replace(/\D/g, "").slice(-10);

async function findCustomer(lead: PipelineLead) {
  if (lead.email) {
    const byEmail = await prisma.customer.findFirst({
      where: { deletedAt: null, email: { equals: lead.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (byEmail) return byEmail;
  }
  const phone = lead.phone ? digits(lead.phone) : "";
  if (phone.length >= 7) {
    // Phones are stored as typed ("(508) 555-0100", "508.555.0100"), so narrow by the last four
    // digits in SQL and compare the full number in code.
    const candidates = await prisma.customer.findMany({
      where: { deletedAt: null, phone: { contains: phone.slice(-4) } },
      select: { id: true, phone: true },
      take: 50,
    });
    const match = candidates.find((c) => c.phone && digits(c.phone) === phone);
    if (match) return { id: match.id };
  }
  return null;
}

/**
 * Keeps the lead's campaign on its card. A later delivery may fill a field still missing, never
 * rewrite one (src/lib/orion-attribution.ts). True when something was added.
 */
async function preserveAttribution(opportunityId: number, customerId: number, lead: PipelineLead, occurredAt: Date): Promise<boolean> {
  const incoming = lead.attribution;
  if (!incoming) return false;
  const existing = await prisma.customerTouchpoint.findFirst({
    where: { customerId, deletedAt: null, metadata: { path: ["opportunityId"], equals: opportunityId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, metadata: true },
  });
  if (existing) {
    const current = attributionFromMetadata(existing.metadata);
    const merged = mergeAttribution(current, incoming);
    if (JSON.stringify(current) === JSON.stringify(merged)) return false;
    const base = existing.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata) ? (existing.metadata as Record<string, unknown>) : {};
    await prisma.customerTouchpoint.update({ where: { id: existing.id }, data: { metadata: { ...base, ...merged } } });
    return true;
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

/**
 * A repeat delivery of a lead already on file. Contact fields only ever go from empty to filled. The
 * card and title are never Make's to upgrade, for the same reason only ORION may re-date (below):
 * Make's copy of a Facebook lead is the thinner one, and it can arrive after the fuller one.
 */
export async function completeExistingLead(opportunityId: number, lead: PipelineLead, caller: PipelineCaller): Promise<string[]> {
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { name: true, notes: true, customerId: true, customer: { select: { email: true, phone: true, address: true, city: true, state: true, zipCode: true } } },
  });
  if (!opportunity) return [];

  const mayUpgrade = caller === "ORION" || caller === "Webhook";
  const contact = blankCustomerFields(opportunity.customer, lead);
  const filled = Object.keys(contact);
  const note = leadCardNote(lead);
  const touchpoint = mayUpgrade
    ? await prisma.customerTouchpoint.findFirst({
        where: { customerId: opportunity.customerId, type: "note", metadata: { path: ["leadId"], equals: lead.leadId } },
        orderBy: { createdAt: "asc" },
        select: { id: true, body: true },
      })
    : null;
  const newNote = !!touchpoint && replacesNote(opportunity.notes, touchpoint.body, note);
  const newName = mayUpgrade ? betterOpportunityName(opportunity.name, lead) : null;
  if (newNote) filled.push("card");
  if (newName) filled.push("title");
  if (filled.length === 0) return [];

  await prisma.$transaction(async (tx) => {
    if (Object.keys(contact).length) await tx.customer.update({ where: { id: opportunity.customerId }, data: contact });
    if (newNote || newName) await tx.opportunity.update({ where: { id: opportunityId }, data: { ...(newNote ? { notes: note } : {}), ...(newName ? { name: newName } : {}) } });
    if (newNote && touchpoint) await tx.customerTouchpoint.update({ where: { id: touchpoint.id }, data: { body: note } });
  });
  return filled;
}

export async function deliverToPipeline(lead: PipelineLead, caller: PipelineCaller): Promise<PipelineResult> {
  const receivedAt = lead.receivedAt ?? new Date();
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
    return { status: "exists", opportunityId: existing.newId, filled, attributionAdded };
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
              lastContactAt: receivedAt,
              createdAt: receivedAt,
            },
            select: { id: true },
          })
        ).id;

      const opportunity = await tx.opportunity.create({
        data: {
          customerId,
          name: leadOpportunityName(lead),
          pipeline: "sales",
          stage: "new_lead",
          status: "open",
          source: CRM_SOURCE[lead.source].leadSource,
          notes: body,
          leadReceivedAt: receivedAt,
          lastStageChangedAt: receivedAt,
          // Dated when the request arrived, not when it reached the CRM, so "leads this month" and
          // the source breakdowns count it in the right month even when it was delivered later.
          createdAt: receivedAt,
          stageHistory: { create: { newStage: "new_lead", effectiveAt: receivedAt, reason: "Initial lead received" } },
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

      if (lead.attribution) {
        await tx.customerTouchpoint.create({
          data: {
            customerId,
            type: "note",
            subject: "Marketing attribution",
            body: "Campaign attribution captured automatically.",
            occurredAt: receivedAt,
            metadata: { type: "marketing_attribution", source: lead.source, leadId: lead.leadId, opportunityId: opportunity.id, ...lead.attribution },
          },
        });
      }

      await tx.migrationMap.create({ data: { entityType: MAP_TYPE, legacyId: lead.leadId, newId: opportunity.id } });
      return { opportunityId: opportunity.id, customerId };
    });

    return { status: "created", customerMatched: !!matched, ...result };
  } catch (err) {
    // Two deliveries of the same lead racing: the loser's MigrationMap insert hits the unique
    // index, its whole transaction rolls back, and the winner's opportunity is the answer.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.migrationMap.findUnique({ where: { entityType_legacyId: { entityType: MAP_TYPE, legacyId: lead.leadId } } });
      if (winner) return { status: "exists", opportunityId: winner.newId };
    }
    throw err;
  }
}
