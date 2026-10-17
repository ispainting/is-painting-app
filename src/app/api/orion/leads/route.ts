import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkOrionAuth } from "@/lib/orion-auth";

// Lead intake from ORION, the marketing platform. Every quote request it receives — the website
// form, the site's chat concierge, a Facebook instant form — is posted here and lands in the sales
// pipeline as a new lead, so nobody retypes it.
//
// - Idempotent: the same leadId always maps to the same opportunity (MigrationMap row
//   "orion_lead"), so retries and backfills never duplicate.
// - Matches an existing customer by email, then by phone, before creating one, so a returning
//   client gets a new opportunity on their own record.
// - Same shape the admin "new opportunity" action writes (stage new_lead, sales pipeline); no
//   automations are triggered here, exactly like that action.
//
// Auth: `Authorization: Bearer <ORION_API_SECRET>`, shared with /api/orion/summary.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAP_TYPE = "orion_lead";

const LeadInput = z.object({
  leadId: z.string().min(1).max(191),
  source: z.enum(["Website", "Meta", "Concierge"]),
  receivedAt: z.string().datetime(),
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(50).optional(),
  zipCode: z.string().trim().max(20).optional(),
  service: z.string().trim().max(120).optional(),
  message: z.string().trim().max(5000).optional(),
  // Any other answers from the form, label → value, kept on the lead's first note.
  details: z.record(z.string().max(5000)).optional(),
});
type LeadInput = z.infer<typeof LeadInput>;

const digits = (value: string) => value.replace(/\D/g, "").slice(-10);

async function findCustomer(lead: LeadInput) {
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

function noteBody(lead: LeadInput) {
  const lines = [
    lead.service && `Service: ${lead.service}`,
    lead.message && `Message: ${lead.message}`,
    ...Object.entries(lead.details ?? {}).map(([label, value]) => `${label}: ${value}`),
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

export async function POST(req: Request) {
  const auth = checkOrionAuth(req);
  if (auth === "unconfigured") {
    console.error("[api/orion/leads] ORION_API_SECRET is not set — refusing lead intake");
    return NextResponse.json({ error: "ORION access is not configured" }, { status: 503 });
  }
  if (auth === "denied") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = LeadInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid lead", issues: parsed.error.issues }, { status: 400 });
  const lead = parsed.data;

  const receivedAt = new Date(lead.receivedAt);
  const existing = await prisma.migrationMap.findUnique({ where: { entityType_legacyId: { entityType: MAP_TYPE, legacyId: lead.leadId } } });
  if (existing) {
    // An ORION lead's opportunity is dated when the request arrived (see below); this also
    // corrects the first backfill, which was stamped with the import time.
    await prisma.opportunity.updateMany({ where: { id: existing.newId, createdAt: { not: receivedAt } }, data: { createdAt: receivedAt } });
    return NextResponse.json({ status: "exists", opportunityId: existing.newId });
  }

  const matched = await findCustomer(lead);
  const body = noteBody(lead);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const customerId =
        matched?.id ??
        (
          await tx.customer.create({
            data: {
              name: lead.name || lead.email || lead.phone || "Website lead",
              email: lead.email,
              phone: lead.phone,
              address: lead.address,
              city: lead.city,
              state: lead.state,
              zipCode: lead.zipCode,
              leadSource: lead.source === "Concierge" ? "Website" : lead.source,
              source: lead.source === "Concierge" ? "Website chat" : lead.source === "Website" ? "Website form" : "Facebook form",
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
          name: [lead.service || "Quote request", lead.city].filter(Boolean).join(" — "),
          pipeline: "sales",
          stage: "new_lead",
          status: "open",
          source: lead.source === "Concierge" ? "Website" : lead.source,
          notes: body,
          lastStageChangedAt: receivedAt,
          // Dated when the request arrived, not when it reached the CRM, so "leads this month" and
          // the source breakdowns count it in the right month even when it was delivered later.
          createdAt: receivedAt,
        },
        select: { id: true },
      });

      await tx.customerTouchpoint.create({
        data: {
          customerId,
          type: "note",
          subject: `Quote request received (${lead.source === "Meta" ? "Facebook form" : lead.source === "Concierge" ? "website chat" : "website form"})`,
          body,
          occurredAt: receivedAt,
          metadata: { via: "ORION", leadId: lead.leadId, opportunityId: opportunity.id },
        },
      });

      await tx.migrationMap.create({ data: { entityType: MAP_TYPE, legacyId: lead.leadId, newId: opportunity.id } });
      return { opportunityId: opportunity.id, customerId };
    });

    return NextResponse.json({ status: "created", customerMatched: !!matched, ...result }, { status: 201 });
  } catch (err) {
    // Two deliveries of the same lead racing: the loser's MigrationMap insert hits the unique
    // index, its whole transaction rolls back, and the winner's opportunity is the answer.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const winner = await prisma.migrationMap.findUnique({ where: { entityType_legacyId: { entityType: MAP_TYPE, legacyId: lead.leadId } } });
      if (winner) return NextResponse.json({ status: "exists", opportunityId: winner.newId });
    }
    console.error("[api/orion/leads] intake failed", err);
    return NextResponse.json({ error: "Lead intake failed" }, { status: 500 });
  }
}
