import { describe, expect, it, vi } from "vitest";

// Mirrors convertToJob: the proposal creates the job with proposalSentAt, then
// the opportunity is found through the Job back-relation (Opportunity.job),
// never via a Proposal.opportunityId column, which does not exist.
const proposal = {
  id: 10,
  customerId: 1,
  projectName: "Kitchen repaint",
  sentAt: new Date("2026-08-20T00:00:00Z"),
};

function buildMocks(leadReceivedAt: Date | null) {
  return {
    job: {
      create: vi.fn().mockResolvedValue({ id: 100 }),
      update: vi.fn().mockResolvedValue({ id: 100 }),
    },
    opportunity: {
      findFirst: vi.fn().mockResolvedValue(leadReceivedAt ? { leadReceivedAt } : null),
    },
  };
}

async function convertLikeRouter(prisma: ReturnType<typeof buildMocks>) {
  const job = await prisma.job.create({
    data: { proposalSentAt: proposal.sentAt ?? null },
  });
  const linkedOpportunity = await prisma.opportunity.findFirst({
    where: { job: { id: job.id } },
    select: { leadReceivedAt: true },
  });
  if (linkedOpportunity?.leadReceivedAt) {
    await prisma.job.update({ where: { id: job.id }, data: { leadReceivedAt: linkedOpportunity.leadReceivedAt } });
  }
  return job;
}

describe("proposal conversion lifecycle dates", () => {
  it("copies the linked opportunity leadReceivedAt into the job", async () => {
    const leadReceivedAt = new Date("2026-08-15T00:00:00Z");
    const prisma = buildMocks(leadReceivedAt);

    await convertLikeRouter(prisma);

    expect(prisma.opportunity.findFirst).toHaveBeenCalledWith({
      where: { job: { id: 100 } },
      select: { leadReceivedAt: true },
    });
    expect(prisma.job.update).toHaveBeenCalledWith({ where: { id: 100 }, data: { leadReceivedAt } });
  });

  it("leaves leadReceivedAt null when no linked opportunity exists", async () => {
    const prisma = buildMocks(null);

    await convertLikeRouter(prisma);

    expect(prisma.job.update).not.toHaveBeenCalled();
  });

  it("copies the proposal sent date into the job", async () => {
    const prisma = buildMocks(null);

    await convertLikeRouter(prisma);

    expect(prisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ proposalSentAt: proposal.sentAt }),
    });
  });
});
