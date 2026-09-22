import { describe, expect, it, vi } from "vitest";
import { invoicesRouter } from "./invoices";

const adminSession = {
  userId: 1,
  role: "admin" as const,
  email: "admin@ispainting.com",
  name: "Admin",
};

function adminCaller(tx: Record<string, unknown>) {
  const transaction = vi.fn(async (
    callback: (client: typeof tx) => unknown,
    _options?: { isolationLevel?: string },
  ) => callback(tx));
  return {
    caller: invoicesRouter.createCaller({ prisma: { $transaction: transaction } as never, session: adminSession }),
    transaction,
  };
}

function deletionTransaction(deletedPayments: number) {
  return {
    invoice: {
      findUnique: vi.fn().mockResolvedValue({ id: 10, jobId: 4 }),
      delete: vi.fn().mockResolvedValue({ id: 10 }),
    },
    payment: {
      deleteMany: vi.fn().mockResolvedValue({ count: deletedPayments }),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

describe("invoices.remove", () => {
  it("deletes an invoice without payments in one transaction", async () => {
    const tx = deletionTransaction(0);
    const { caller, transaction } = adminCaller(tx);

    await expect(caller.remove({ id: 10, jobId: 4 })).resolves.toEqual({ id: 10, deletedPayments: 0 });
    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction.mock.calls[0]?.[1]).toEqual({ isolationLevel: "Serializable" });
    expect(tx.payment.deleteMany).toHaveBeenCalledWith({ where: { invoiceId: 10 } });
    expect(tx.invoice.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(tx.payment.count).toHaveBeenCalledWith({ where: { invoiceId: 10 } });
  });

  it("deletes all linked payments before deleting the invoice", async () => {
    const tx = deletionTransaction(3);
    const { caller } = adminCaller(tx);

    await expect(caller.remove({ id: 10, jobId: 4 })).resolves.toEqual({ id: 10, deletedPayments: 3 });
    expect(tx.payment.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.invoice.delete.mock.invocationCallOrder[0]!);
  });

  it("preserves unrelated payments by deleting only on invoiceId", async () => {
    const tx = deletionTransaction(2);
    const { caller } = adminCaller(tx);

    await caller.remove({ id: 10, jobId: 4 });
    expect(tx.payment.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { invoiceId: 10 } });
    expect(tx.payment.deleteMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: { jobId: 4 } }));
  });

  it("rejects the wrong job and does not delete anything", async () => {
    const tx = deletionTransaction(2);
    const { caller } = adminCaller(tx);

    await expect(caller.remove({ id: 10, jobId: 99 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Invoice does not belong to this job.",
    });
    expect(tx.payment.deleteMany).not.toHaveBeenCalled();
    expect(tx.invoice.delete).not.toHaveBeenCalled();
  });

  it("rejects unauthorized employee deletion before starting a transaction", async () => {
    const transaction = vi.fn();
    const caller = invoicesRouter.createCaller({
      prisma: { $transaction: transaction } as never,
      session: { ...adminSession, userId: 2, role: "employee" },
    });

    await expect(caller.remove({ id: 10, jobId: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(transaction).not.toHaveBeenCalled();
  });
});
