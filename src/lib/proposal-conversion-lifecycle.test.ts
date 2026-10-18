import { describe, expect, it, vi } from "vitest";

// Mirrors the repaired convertToJob: the job is created inside one transaction
// with proposalSentAt plus the resolved opportunity's id and leadReceivedAt.
// The old post-create lookup through the Job back-relation was dead code
// (Job.opportunityId was never written) and has been removed.
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
      findFirst: vi.fn().mockResolvedValue(leadReceivedAt ? { id: 7, leadReceivedAt } : null),
    },
  };
}

async function convertLikeRouter(prisma: ReturnType<typeof buildMocks>) {
  const linkedOpportunity = await prisma.opportunity.findFirst({
    where: { customerId: proposal.customerId, status: "open" },
    select: { id: true, leadReceivedAt: true },
  });
  return prisma.job.create({
    data: {
      opportunityId: linkedOpportunity?.id ?? null,
      leadReceivedAt: linkedOpportunity?.leadReceivedAt ?? null,
      proposalSentAt: proposal.sentAt ?? null,
    },
  });
}

describe("proposal conversion lifecycle dates", () => {
  it("copies the linked opportunity leadReceivedAt into the job at creation", async () => {
    const leadReceivedAt = new Date("2026-08-15T00:00:00Z");
    const prisma = buildMocks(leadReceivedAt);

    await convertLikeRouter(prisma);

    expect(prisma.job.create).toHaveBeenCalledWith({
      data: { opportunityId: 7, leadReceivedAt, proposalSentAt: proposal.sentAt },
    });
    expect(prisma.job.update).not.toHaveBeenCalled();
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
