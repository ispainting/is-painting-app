import { describe, expect, it, vi } from "vitest";
import { customersRouter } from "./customers";
import { startOfBusinessDayInMassachusetts } from "@/lib/employee-rate-resolver";

const adminSession = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };

type Tx = {
  customer: { create: ReturnType<typeof vi.fn> };
  opportunity: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

function callerWith(tx: Tx) {
  const prisma = {
    $transaction: vi.fn(async (callback: (client: Tx) => unknown) => callback(tx)),
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return customersRouter.createCaller({ prisma: prisma as never, session: adminSession });
}

function makeTx(existingOpen: { id: number } | null = null) {
  return {
    customer: { create: vi.fn().mockResolvedValue({ id: 10, name: "Synthetic Customer" }) },
    opportunity: {
      findFirst: vi.fn().mockResolvedValue(existingOpen),
      create: vi.fn().mockResolvedValue({ id: 55 }),
    },
  };
}

const baseInput = {
  name: "Synthetic Customer",
  tags: [] as string[],
  secondaryPhoneNumbers: [] as never[],
  secondaryEmails: [] as never[],
  properties: [] as never[],
  colorPreferences: [] as never[],
  paintHistory: [] as never[],
  productHistory: [] as never[],
  warrantyHistory: [] as never[],
};

describe("customers.create opportunity intake", () => {
  it("creates one Opportunity by default with the selected stage, source, and MA-anchored lead date", async () => {
    const tx = makeTx();
    const leadDate = startOfBusinessDayInMassachusetts("2026-10-17");

    const result = await callerWith(tx).create({
      ...baseInput,
      leadSource: "Referral",
      referralSource: "Jane D",
      createOpportunity: true,
      opportunityStage: "follow_up",
      leadReceivedAt: leadDate,
    });

    expect(result.opportunityCreated).toBe(true);
    expect(result.opportunityId).toBe(55);
    expect(tx.opportunity.create).toHaveBeenCalledTimes(1);
    const data = tx.opportunity.create.mock.calls[0]?.[0].data;
    expect(data.customerId).toBe(10);
    expect(data.stage).toBe("follow_up");
    expect(data.source).toBe("Referral");
    expect(data.leadReceivedAt.toISOString()).toBe("2026-10-17T04:00:00.000Z");
    // Referral Name stored on the customer because Lead Source = Referral
    expect(tx.customer.create.mock.calls[0]?.[0].data.referralSource).toBe("Jane D");
  });

  it("creates only the Customer when the checkbox is off", async () => {
    const tx = makeTx();
    const result = await callerWith(tx).create({ ...baseInput, createOpportunity: false });

    expect(result.opportunityCreated).toBe(false);
    expect(tx.opportunity.create).not.toHaveBeenCalled();
    expect(tx.customer.create).toHaveBeenCalledTimes(1);
  });

  it("drops Referral Name when Lead Source is not Referral", async () => {
    const tx = makeTx();
    await callerWith(tx).create({ ...baseInput, leadSource: "Google", referralSource: "Should Not Persist" });
    expect(tx.customer.create.mock.calls[0]?.[0].data.referralSource).toBeUndefined();
  });

  it("is atomic: an Opportunity failure rejects the whole mutation", async () => {
    const tx = makeTx();
    tx.opportunity.create.mockRejectedValue(new Error("synthetic db failure"));
    await expect(callerWith(tx).create({ ...baseInput, createOpportunity: true })).rejects.toThrow("synthetic db failure");
  });

  it("skips creation when the customer already has an open non-terminal opportunity", async () => {
    const tx = makeTx({ id: 99 });
    const result = await callerWith(tx).create({ ...baseInput, createOpportunity: true });

    expect(result.opportunityCreated).toBe(false);
    expect(result.opportunitySkippedExistingOpen).toBe(true);
    expect(tx.opportunity.create).not.toHaveBeenCalled();
    // The duplicate guard checks open status and excludes terminal stages.
    const where = tx.opportunity.findFirst.mock.calls[0]?.[0].where;
    expect(where.status).toBe("open");
    expect(where.stage.notIn).toEqual(["lost", "not_qualified", "invalid_duplicate", "spam_fraud", "completed"]);
  });

  it("does not let lost/not_qualified history block a new lead", async () => {
    // DB returns null for the filtered lookup when only terminal opportunities exist.
    const tx = makeTx(null);
    const result = await callerWith(tx).create({ ...baseInput, createOpportunity: true });
    expect(result.opportunityCreated).toBe(true);
  });

  it("stays compatible with existing callers that omit the new fields", async () => {
    const tx = makeTx();
    const result = await callerWith(tx).create(baseInput);

    expect(result.id).toBe(10);
    expect(result.opportunityCreated).toBe(false);
    expect(tx.opportunity.findFirst).not.toHaveBeenCalled();
    expect(tx.opportunity.create).not.toHaveBeenCalled();
  });

  it("preserves a legacy free-text lead source through creation", async () => {
    const tx = makeTx();
    await callerWith(tx).create({ ...baseInput, leadSource: "Home Show 2024", createOpportunity: true });

    expect(tx.customer.create.mock.calls[0]?.[0].data.leadSource).toBe("Home Show 2024");
    expect(tx.opportunity.create.mock.calls[0]?.[0].data.source).toBe("Home Show 2024");
  });

  it("never writes Customer.source or Customer.status from the create intake", async () => {
    const tx = makeTx();
    await callerWith(tx).create({ ...baseInput, createOpportunity: true });

    const data = tx.customer.create.mock.calls[0]?.[0].data;
    expect(data.source).toBeUndefined();
    expect(data.status).toBeUndefined();
  });
});
