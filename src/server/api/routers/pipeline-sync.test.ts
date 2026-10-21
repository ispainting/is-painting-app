import { describe, expect, it, vi } from "vitest";
import { proposalsRouter } from "./proposals";
import { jobsRouter } from "./jobs";

const adminSession = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };

describe("proposals.setStatus → opportunity sync", () => {
  function mocks(stage: string, status = "open") {
    return {
      proposal: {
        findUnique: vi.fn().mockResolvedValue({ status: "draft", sentAt: null, approvedAt: null, customerId: 1, opportunityId: 5 }),
        update: vi.fn().mockResolvedValue({ id: 1 }),
      },
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: 5, stage, status }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it("sent → estimate_sent", async () => {
    const prisma = mocks("follow_up");
    await proposalsRouter.createCaller({ prisma: prisma as never, session: adminSession }).setStatus({ id: 1, status: "sent" });
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "estimate_sent" }) })
    );
  });

  it("approved → approval", async () => {
    const prisma = mocks("estimate_sent");
    await proposalsRouter.createCaller({ prisma: prisma as never, session: adminSession }).setStatus({ id: 1, status: "approved" });
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "approval" }) })
    );
  });

  it("declined → follow_up", async () => {
    const prisma = mocks("estimate_sent");
    await proposalsRouter.createCaller({ prisma: prisma as never, session: adminSession }).setStatus({ id: 1, status: "declined" });
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "follow_up" }) })
    );
  });

  it("terminal opportunities are never moved", async () => {
    const prisma = mocks("spam_fraud");
    await proposalsRouter.createCaller({ prisma: prisma as never, session: adminSession }).setStatus({ id: 1, status: "sent" });
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("setStatus cannot assign converted manually", async () => {
    const prisma = mocks("estimate_sent");
    await expect(
      proposalsRouter.createCaller({ prisma: prisma as never, session: adminSession }).setStatus({ id: 1, status: "converted" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(prisma.proposal.update).not.toHaveBeenCalled();
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });
});

describe("jobs.setStatus → opportunity sync", () => {
  function mocks(stage: string) {
    const tx = {
      job: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ opportunityId: 5, workStartedAt: null, totalEstimate: 1000, completedAt: null })
          .mockResolvedValue({ id: 1, status: "approved", contractAmount: 1000, totalEstimate: 1000, opportunityId: 5, completionSource: null, completionPreviousStatus: null, completedAt: null }),
        update: vi.fn().mockResolvedValue({ id: 1 }),
      },
      invoice: { findMany: vi.fn().mockResolvedValue([]) },
      payment: { findMany: vi.fn().mockResolvedValue([]) },
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: 5, stage, status: "open" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    return {
      ...tx,
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
  }

  it.each([
    ["approved", "approval"],
    ["active", "service_delivery"],
    ["completed", "completed"],
    ["cancelled", "lost"],
  ] as const)("job %s → opportunity %s", async (jobStatus, expectedStage) => {
    const prisma = mocks("estimate_sent");
    await jobsRouter.createCaller({ prisma: prisma as never, session: adminSession }).setStatus({ id: 1, status: jobStatus });
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: expectedStage }) })
    );
  });

  it("on_hold moves a nonterminal opportunity into the hold stage", async () => {
    const prisma = mocks("service_delivery");
    await jobsRouter.createCaller({ prisma: prisma as never, session: adminSession }).setStatus({ id: 1, status: "on_hold" });
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "on_hold" }) })
    );
  });

  it("estimate status makes no automatic change", async () => {
    const prisma = mocks("new_lead");
    await jobsRouter.createCaller({ prisma: prisma as never, session: adminSession }).setStatus({ id: 1, status: "estimate" });
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });
});

describe("jobs.updateLifecycleDates → opportunity sync", () => {
  it("setting workStartedAt advances to service_delivery", async () => {
    const tx = {
      job: { update: vi.fn().mockResolvedValue({ id: 1, opportunityId: 5 }) },
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: 5, stage: "approval", status: "open" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    await jobsRouter
      .createCaller({ prisma: prisma as never, session: adminSession })
      .updateLifecycleDates({ id: 1, workStartedAt: new Date("2026-10-10T04:00:00Z") });
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "service_delivery" }) })
    );
  });

  it("lead/proposal date edits alone do not move the stage", async () => {
    const tx = {
      job: { update: vi.fn().mockResolvedValue({ id: 1, opportunityId: 5 }) },
      opportunity: { findUnique: vi.fn(), update: vi.fn() },
    };
    const prisma = {
      ...tx,
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    await jobsRouter
      .createCaller({ prisma: prisma as never, session: adminSession })
      .updateLifecycleDates({ id: 1, leadReceivedAt: new Date("2026-10-01T04:00:00Z") });
    expect(prisma.opportunity.findUnique).not.toHaveBeenCalled();
  });
});

describe("convertToJob → approval stage", () => {
  it("advances the resolved opportunity to approval and preserves the proposal", async () => {
    const tx = {
      proposal: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      job: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 100, estimateNumber: "EST-100" }),
      },
      jobMaterial: { createMany: vi.fn() },
      jobLabor: { createMany: vi.fn() },
      opportunity: {
        findUnique: vi.fn().mockResolvedValue({ id: 7, stage: "estimate_sent", status: "open" }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      proposal: {
        findUnique: vi.fn().mockResolvedValue({
          id: 10,
          customerId: 1,
          projectName: "Kitchen",
          address: null,
          city: null,
          state: null,
          zipCode: null,
          scopeOfWork: null,
          status: "approved",
          sentAt: new Date("2026-08-20T00:00:00Z"),
          totalAmount: 1000,
          estimateSummaryJson: null,
          sections: [],
          opportunity: { id: 7, customerId: 1, leadReceivedAt: null },
        }),
        updateMany: tx.proposal.updateMany,
      },
      opportunity: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ id: 7, stage: "estimate_sent", status: "open" }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    const result = await proposalsRouter
      .createCaller({ prisma: prisma as never, session: adminSession })
      .convertToJob({ id: 10 });

    expect(result.opportunityLinked).toBe(true);
    // Proposal preserved as converted, never deleted.
    expect(tx.proposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "converted" } })
    );
    expect(tx.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "approval" }) })
    );
  });
});
