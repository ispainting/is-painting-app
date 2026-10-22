import { describe, expect, it, vi } from "vitest";
import {
  applyOpportunityTransition,
  isQualifiedLead,
  isValidLead,
  isTerminalStage,
  opportunityStageLabel,
  resolveJobStatusStage,
  resolveProposalEventStage,
  shouldAutoTransition,
} from "./pipeline-sync";

describe("stage labels", () => {
  it("displays the new and renamed labels", () => {
    expect(opportunityStageLabel("lost")).toBe("Lost / Cancelled");
    expect(opportunityStageLabel("invalid_duplicate")).toBe("Invalid / Duplicate");
    expect(opportunityStageLabel("spam_fraud")).toBe("Spam / Fraud");
    expect(opportunityStageLabel("new_lead")).toBe("New Lead");
  });
});

describe("event mappings", () => {
  it("maps proposal events to stages", () => {
    expect(resolveProposalEventStage("sent")).toBe("estimate_sent");
    expect(resolveProposalEventStage("approved")).toBe("approval");
    expect(resolveProposalEventStage("declined")).toBe("follow_up");
    expect(resolveProposalEventStage("converted")).toBe("approval");
    expect(resolveProposalEventStage("created")).toBeNull();
    expect(resolveProposalEventStage("edited")).toBeNull();
    expect(resolveProposalEventStage("reopened")).toBeNull();
  });

  it("maps job statuses to stages", () => {
    expect(resolveJobStatusStage("estimate")).toBeNull();
    expect(resolveJobStatusStage("sent")).toBe("estimate_sent");
    expect(resolveJobStatusStage("approved")).toBe("approval");
    expect(resolveJobStatusStage("active")).toBe("service_delivery");
    expect(resolveJobStatusStage("completed")).toBe("completed");
    expect(resolveJobStatusStage("on_hold")).toBe("on_hold");
    expect(resolveJobStatusStage("cancelled")).toBe("lost");
  });
});

describe("shouldAutoTransition", () => {
  const open = (stage: string) => ({ stage, status: "open" });

  it("never moves any terminal stage automatically", () => {
    for (const stage of ["not_qualified", "lost", "invalid_duplicate", "spam_fraud"]) {
      expect(shouldAutoTransition(open(stage), "review")).toBe(false);
      expect(shouldAutoTransition(open(stage), "follow_up")).toBe(false);
      expect(shouldAutoTransition(open(stage), "new_lead")).toBe(false);
    }
  });

  it("is forward-only except the explicit on_hold exception", () => {
    expect(shouldAutoTransition(open("follow_up"), "estimate_sent")).toBe(true);
    expect(shouldAutoTransition(open("approval"), "estimate_sent")).toBe(false);
    expect(shouldAutoTransition(open("approval"), "estimate_sent", { allowBackward: true })).toBe(true);
  });

  it("is idempotent and respects won/closed status", () => {
    expect(shouldAutoTransition(open("review"), "review")).toBe(false);
    expect(shouldAutoTransition({ stage: "review", status: "won" }, "new_lead")).toBe(false);
  });

  it("automation may enter lost (job cancelled) but never invalid/spam/not_qualified", () => {
    expect(shouldAutoTransition(open("service_delivery"), "lost")).toBe(true);
    expect(shouldAutoTransition(open("new_lead"), "invalid_duplicate")).toBe(false);
    expect(shouldAutoTransition(open("new_lead"), "spam_fraud")).toBe(false);
    expect(shouldAutoTransition(open("new_lead"), "not_qualified")).toBe(false);
  });
});

describe("applyOpportunityTransition", () => {
  function mockPrisma(current: { id: number; stage: string; status: string } | null) {
    return {
      opportunity: {
        findUnique: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue({}),
      },
    };
  }

  it("applies a valid forward transition and stamps lastStageChangedAt", async () => {
    const prisma = mockPrisma({ id: 5, stage: "estimate_sent", status: "open" });
    const result = await applyOpportunityTransition(prisma, 5, "approval");
    expect(result).toEqual({ applied: true, stage: "approval" });
    expect(prisma.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 5 }),
        data: expect.objectContaining({ stage: "approval", status: "open" }),
      })
    );
  });

  it("resists changes on terminal opportunities", async () => {
    const prisma = mockPrisma({ id: 5, stage: "spam_fraud", status: "open" });
    const result = await applyOpportunityTransition(prisma, 5, "review");
    expect(result.applied).toBe(false);
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
  });

  it("is a safe no-op without a link or target", async () => {
    const prisma = mockPrisma(null);
    await expect(applyOpportunityTransition(prisma, null, "approval")).resolves.toEqual({ applied: false, stage: null });
    await expect(applyOpportunityTransition(prisma, 5, null)).resolves.toEqual({ applied: false, stage: null });
  });
});

describe("lead classification", () => {
  it("separates duplicate/spam from valid leads and keeps lost qualified", () => {
    expect(isValidLead("new_lead")).toBe(true);
    expect(isValidLead("invalid_duplicate")).toBe(false);
    expect(isValidLead("spam_fraud")).toBe(false);
    expect(isQualifiedLead("lost")).toBe(true);
    expect(isQualifiedLead("not_qualified")).toBe(false);
    expect(isQualifiedLead("invalid_duplicate")).toBe(false);
    expect(isTerminalStage("invalid_duplicate")).toBe(true);
    expect(isTerminalStage("spam_fraud")).toBe(true);
    expect(isTerminalStage("follow_up")).toBe(false);
  });
});
