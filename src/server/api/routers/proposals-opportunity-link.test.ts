import { describe, expect, it, vi } from "vitest";
import { proposalsRouter } from "./proposals";
import { buildJobsListWhere } from "@/lib/job-filters";

const adminSession = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };

function callerWith(prisma: Record<string, unknown>) {
  return proposalsRouter.createCaller({ prisma: prisma as never, session: adminSession });
}

const minimalCreateInput = {
  status: "draft" as const,
  materialsBudget: 0,
  laborBudget: 0,
  subcontractorBudget: 0,
  estimateSubcontractorCost: 0,
  estimateEquipmentCost: 0,
  estimateLogisticsCost: 0,
  estimateMiscProjectCost: 0,
  includeWorkersCompInRecommendedPrice: true,
  includeGeneralLiabilityInRecommendedPrice: true,
  showTaxPlanning: true,
  includeTaxReserveInRecommendedPrice: false,
  otherCosts: [],
  estimateWorkItems: [],
  sections: [],
  options: [],
  attachments: [],
  paintColors: [],
};

function createMocks() {
  return {
    proposal: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    config: { findUnique: vi.fn().mockResolvedValue(null) },
    opportunity: {
      findUnique: vi.fn().mockResolvedValue({ id: 5, customerId: 10, status: "open", stage: "follow_up" }),
    },
  };
}

describe("proposals.create opportunity link", () => {
  it("keeps legacy callers compatible: omitted opportunityId stays null", async () => {
    const prisma = createMocks();
    await callerWith(prisma).create({ ...minimalCreateInput, customerId: 10, projectName: "Legacy" });

    expect(prisma.opportunity.findUnique).not.toHaveBeenCalled();
    expect(prisma.proposal.create.mock.calls[0]?.[0].data.opportunityId).toBeNull();
  });

  it("stores a validated opportunityId", async () => {
    const prisma = createMocks();
    await callerWith(prisma).create({ ...minimalCreateInput, customerId: 10, opportunityId: 5 });

    expect(prisma.proposal.create.mock.calls[0]?.[0].data.opportunityId).toBe(5);
  });

  it("rejects an opportunity belonging to another customer", async () => {
    const prisma = createMocks();
    prisma.opportunity.findUnique.mockResolvedValue({ id: 5, customerId: 99, status: "open", stage: "follow_up" });

    await expect(
      callerWith(prisma).create({ ...minimalCreateInput, customerId: 10, opportunityId: 5 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Opportunity does not belong to the selected customer." });
    expect(prisma.proposal.create).not.toHaveBeenCalled();
  });

  it("rejects a terminal or closed opportunity", async () => {
    const prisma = createMocks();
    prisma.opportunity.findUnique.mockResolvedValue({ id: 5, customerId: 10, status: "open", stage: "not_qualified" });

    await expect(
      callerWith(prisma).create({ ...minimalCreateInput, customerId: 10, opportunityId: 5 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.proposal.create).not.toHaveBeenCalled();
  });
});

describe("proposals.setOpportunity", () => {
  function setOpportunityMocks() {
    return {
      proposal: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, customerId: 10, status: "sent" }),
        update: vi.fn().mockResolvedValue({ id: 1 }),
      },
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: 5, customerId: 10, status: "open", stage: "follow_up" }),
      },
    };
  }

  it("links a valid opportunity", async () => {
    const prisma = setOpportunityMocks();
    await callerWith(prisma).setOpportunity({ id: 1, opportunityId: 5 });
    expect(prisma.proposal.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { opportunityId: 5 } })
    );
  });

  it("clears the link with null", async () => {
    const prisma = setOpportunityMocks();
    await callerWith(prisma).setOpportunity({ id: 1, opportunityId: null });
    expect(prisma.proposal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { opportunityId: null } })
    );
    expect(prisma.opportunity.findUnique).not.toHaveBeenCalled();
  });

  it("rejects customer-mismatched and terminal opportunities", async () => {
    const prisma = setOpportunityMocks();
    prisma.opportunity.findUnique.mockResolvedValueOnce({ id: 5, customerId: 99, status: "open", stage: "review" });
    await expect(callerWith(prisma).setOpportunity({ id: 1, opportunityId: 5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    prisma.opportunity.findUnique.mockResolvedValueOnce({ id: 5, customerId: 10, status: "open", stage: "lost" });
    await expect(callerWith(prisma).setOpportunity({ id: 1, opportunityId: 5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("refuses to change a converted proposal", async () => {
    const prisma = setOpportunityMocks();
    prisma.proposal.findUnique.mockResolvedValue({ id: 1, customerId: 10, status: "converted" });
    await expect(callerWith(prisma).setOpportunity({ id: 1, opportunityId: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("proposals.convertToJob opportunity resolution", () => {
  const sentAt = new Date("2026-08-20T00:00:00.000Z");
  const leadReceivedAt = new Date("2026-08-15T00:00:00.000Z");

  function proposalWith(opportunity: unknown) {
    return {
      id: 10,
      customerId: 1,
      projectName: "Kitchen repaint",
      address: null,
      city: null,
      state: null,
      zipCode: null,
      scopeOfWork: null,
      status: "approved",
      sentAt,
      totalAmount: 1000,
      estimateSummaryJson: null,
      sections: [],
      opportunity,
    };
  }

  function conversionMocks(proposal: unknown, openOpportunities: Array<unknown>) {
    const tx = {
      proposal: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      job: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 100, estimateNumber: "EST-100" }),
      },
      jobMaterial: { createMany: vi.fn() },
      jobLabor: { createMany: vi.fn() },
    };
    const prisma = {
      proposal: { findUnique: vi.fn().mockResolvedValue(proposal) },
      opportunity: {
        findMany: vi.fn().mockResolvedValue(openOpportunities),
        findUnique: vi.fn().mockResolvedValue({ id: 7, stage: "estimate_sent", status: "open" }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    return { prisma, tx };
  }

  it("uses Proposal.opportunityId and copies lifecycle dates into the new Job", async () => {
    const { prisma, tx } = conversionMocks(
      proposalWith({ id: 7, customerId: 1, leadReceivedAt }),
      []
    );
    const result = await callerWith(prisma).convertToJob({ id: 10 });

    const data = tx.job.create.mock.calls[0]?.[0].data;
    expect(data.opportunityId).toBe(7);
    expect(data.leadReceivedAt).toBe(leadReceivedAt);
    expect(data.proposalSentAt).toBe(sentAt);
    expect(result.opportunityLinked).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("creates the job approved and active-visible so it appears in the Approved tab", async () => {
    const { prisma, tx } = conversionMocks(
      proposalWith({ id: 7, customerId: 1, leadReceivedAt }),
      []
    );
    await callerWith(prisma).convertToJob({ id: 10 });

    const data = tx.job.create.mock.calls[0]?.[0].data;
    expect(data.status).toBe("approved");
    expect(data.deletedAt).toBeNull();
    expect(data.approvedAt).toBeInstanceOf(Date);

    // Integration-style proof: the created row satisfies the exact Jobs
    // Approved-tab filter produced by buildJobsListWhere.
    const approvedTabWhere = buildJobsListWhere({ status: "approved", visibility: "active" }, { isEmployee: false });
    expect(data.status).toBe(approvedTabWhere.status);
    expect(data.deletedAt).toBe(approvedTabWhere.deletedAt);
    expect(data.customerId).toBe(1);
    expect(data.opportunityId).toBe(7);
    expect(data.totalEstimate).toBe(1000);
    expect(data.contractAmount).toBe(1000);
  });

  it("moves the linked Opportunity only after the Job is successfully created", async () => {
    const { prisma, tx } = conversionMocks(
      proposalWith({ id: 7, customerId: 1, leadReceivedAt }),
      []
    );
    tx.job.create.mockRejectedValueOnce(new Error("synthetic insert failure"));

    await expect(callerWith(prisma).convertToJob({ id: 10 })).rejects.toThrow("synthetic insert failure");
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("legacy conversion links the single unambiguous open opportunity", async () => {
    const { prisma, tx } = conversionMocks(
      proposalWith(null),
      [{ id: 9, leadReceivedAt, status: "open", stage: "follow_up" }]
    );
    const result = await callerWith(prisma).convertToJob({ id: 10 });

    expect(tx.job.create.mock.calls[0]?.[0].data.opportunityId).toBe(9);
    expect(result.opportunityLinked).toBe(true);
  });

  it("stops with BAD_REQUEST on ambiguous legacy data and creates no Job", async () => {
    const { prisma, tx } = conversionMocks(
      proposalWith(null),
      [
        { id: 9, leadReceivedAt, status: "open", stage: "follow_up" },
        { id: 11, leadReceivedAt: null, status: "open", stage: "new_lead" },
      ]
    );
    await expect(callerWith(prisma).convertToJob({ id: 10 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.job.create).not.toHaveBeenCalled();
  });

  it("creates an unlinked Job with a warning when no opportunity exists", async () => {
    const { prisma, tx } = conversionMocks(proposalWith(null), []);
    const result = await callerWith(prisma).convertToJob({ id: 10 });

    expect(tx.job.create.mock.calls[0]?.[0].data.opportunityId).toBeNull();
    expect(tx.job.create.mock.calls[0]?.[0].data.leadReceivedAt).toBeNull();
    expect(result.opportunityLinked).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("never invents lifecycle dates: null sources stay null", async () => {
    const { prisma, tx } = conversionMocks(proposalWith(null), []);
    const proposal = proposalWith(null) as ReturnType<typeof proposalWith>;
    proposal.sentAt = null as never;
    prisma.proposal.findUnique.mockResolvedValue(proposal);

    await callerWith(prisma).convertToJob({ id: 10 });
    const data = tx.job.create.mock.calls[0]?.[0].data;
    expect(data.leadReceivedAt).toBeNull();
    expect(data.proposalSentAt).toBeNull();
  });

  it("conversion retry never creates a duplicate Job", async () => {
    const converted = { ...proposalWith(null), status: "converted" };
    const { prisma, tx } = conversionMocks(converted, []);
    await expect(callerWith(prisma).convertToJob({ id: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(tx.job.create).not.toHaveBeenCalled();
  });

  it("reuses the existing Job when the opportunity was already converted", async () => {
    const { prisma, tx } = conversionMocks(
      proposalWith({ id: 7, customerId: 1, leadReceivedAt }),
      []
    );
    tx.job.findUnique.mockResolvedValue({ id: 88, estimateNumber: "EST-88" });

    const result = await callerWith(prisma).convertToJob({ id: 10 });
    expect(result.reusedExistingJob).toBe(true);
    expect(result.id).toBe(88);
    expect(tx.job.create).not.toHaveBeenCalled();
  });
});
