import { describe, expect, it, vi } from "vitest";
import { paymentsRouter } from "./payments";

const session = {
  userId: 1,
  role: "admin" as const,
  email: "admin@ispainting.com",
  name: "Admin",
};

function callerWithTransaction(tx: Record<string, unknown>) {
  const transaction = vi.fn(async (
    callback: (client: typeof tx) => unknown,
    _options?: { isolationLevel?: string },
  ) => callback(tx));
  const caller = paymentsRouter.createCaller({ prisma: { $transaction: transaction } as never, session });
  return { caller, transaction };
}

describe("payments.create", () => {
  it("creates and recalculates a linked invoice in one serializable transaction", async () => {
    const invoiceFindUnique = vi.fn()
      .mockResolvedValueOnce({ id: 10, jobId: 4, total: 500, status: "sent" })
      .mockResolvedValueOnce({ id: 10, total: 500, status: "sent", sentAt: new Date(), dueDate: null });
    const paymentAggregate = vi.fn()
      .mockResolvedValueOnce({ _sum: { amount: 100 } })
      .mockResolvedValueOnce({ _sum: { amount: 100 } })
      .mockResolvedValueOnce({ _sum: { amount: 200 } });
    const paymentCreate = vi.fn().mockResolvedValue({ id: 20, amount: 100 });
    const invoiceUpdate = vi.fn().mockResolvedValue({ id: 10 });
    const tx = {
      job: { findUnique: vi.fn().mockResolvedValue({ id: 4, contractAmount: 1000, totalEstimate: 900 }) },
      invoice: {
        findUnique: invoiceFindUnique,
        aggregate: vi.fn().mockResolvedValue({ _sum: { total: 500 } }),
        update: invoiceUpdate,
      },
      payment: { aggregate: paymentAggregate, create: paymentCreate },
    };
    const { caller, transaction } = callerWithTransaction(tx);

    await caller.create({ jobId: 4, invoiceId: 10, amount: 100, dateReceived: new Date(), method: "check" });

    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: "Serializable" });
    expect(paymentCreate).toHaveBeenCalledOnce();
    expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 10 },
      data: { amountPaid: 200, amountRemaining: 300, status: "partial" },
    }));
  });

  it("rejects an invoice belonging to another job before creating a payment", async () => {
    const paymentCreate = vi.fn();
    const tx = {
      job: { findUnique: vi.fn().mockResolvedValue({ id: 4, contractAmount: 1000, totalEstimate: 900 }) },
      invoice: { findUnique: vi.fn().mockResolvedValue({ id: 10, jobId: 5, total: 500, status: "sent" }) },
      payment: { create: paymentCreate },
    };
    const { caller } = callerWithTransaction(tx);

    await expect(caller.create({ jobId: 4, invoiceId: 10, amount: 100, dateReceived: new Date() })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invoice does not belong to this job.",
    });
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it("rejects overpayment before creating a payment", async () => {
    const paymentCreate = vi.fn();
    const tx = {
      job: { findUnique: vi.fn().mockResolvedValue({ id: 4, contractAmount: 500, totalEstimate: 500 }) },
      invoice: {
        findUnique: vi.fn().mockResolvedValue({ id: 10, jobId: 4, total: 500, status: "sent" }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { total: 500 } }),
      },
      payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 450 } }), create: paymentCreate },
    };
    const { caller } = callerWithTransaction(tx);

    await expect(caller.create({ jobId: 4, invoiceId: 10, amount: 50.01, dateReceived: new Date() })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(paymentCreate).not.toHaveBeenCalled();
  });
});

describe("payments.remove", () => {
  it("deletes and recalculates the linked invoice in one transaction", async () => {
    const invoiceUpdate = vi.fn().mockResolvedValue({ id: 10 });
    const tx = {
      payment: {
        findUnique: vi.fn().mockResolvedValue({ id: 20, invoiceId: 10 }),
        delete: vi.fn().mockResolvedValue({ id: 20 }),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 100 } }),
      },
      invoice: {
        findUnique: vi.fn().mockResolvedValue({ id: 10, total: 500, status: "paid", sentAt: new Date(), dueDate: null }),
        update: invoiceUpdate,
      },
    };
    const { caller, transaction } = callerWithTransaction(tx);

    await caller.remove({ id: 20 });

    expect(transaction).toHaveBeenCalledOnce();
    expect(tx.payment.delete).toHaveBeenCalledWith({ where: { id: 20 } });
    expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { amountPaid: 100, amountRemaining: 400, status: "partial" },
    }));
  });
});
