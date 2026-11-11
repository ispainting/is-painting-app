import { describe, expect, it, vi } from "vitest";
import { timeRouter } from "./time";

const employeeSession = {
  userId: 7,
  role: "employee" as const,
  email: "synthetic-employee@example.test",
  name: "Synthetic Employee",
};

function callerWith(prisma: Record<string, unknown>) {
  return timeRouter.createCaller({ prisma: prisma as never, session: employeeSession });
}

describe("time clock session identity", () => {
  it("clockIn always uses the server session userId, never a browser-supplied one", async () => {
    const prisma = {
      timeEntry: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 1 }),
      },
      employeeHourlyRateHistory: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findUnique: vi.fn().mockResolvedValue({ hourlyRate: 25 }) },
    };

    await callerWith(prisma).clockIn({ lat: 41.7, lng: -70.7, userId: 999 } as never);

    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 7, clockOut: null }) })
    );
    const createData = prisma.timeEntry.create.mock.calls[0]?.[0].data;
    expect(createData.userId).toBe(7);
  });

  it("clockOut operates on the session user's open entry only", async () => {
    const open = {
      id: 5,
      userId: 7,
      clockIn: new Date(Date.now() - 60 * 60 * 1000),
      clockInLatitude: null,
      clockInLongitude: null,
      clockOutLatitude: null,
      clockOutLongitude: null,
      breakStartedAt: null,
      breakEndedAt: null,
    };
    const prisma = {
      timeEntry: {
        findFirst: vi.fn().mockResolvedValue(open),
        update: vi.fn().mockResolvedValue({ ...open, clockOut: new Date() }),
      },
    };

    await callerWith(prisma).clockOut({});

    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 7, clockOut: null }) })
    );
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5 } })
    );
  });

  it("myEntries history is scoped to the session user", async () => {
    const prisma = {
      timeEntry: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await callerWith(prisma).myEntries({ days: 14 });

    const where = prisma.timeEntry.findMany.mock.calls[0]?.[0].where;
    expect(where.userId).toBe(7);
  });
});

describe("stale historical open entries (16h live-shift window)", () => {
  const staleOpen = {
    id: 704,
    userId: 7,
    clockIn: new Date("2026-02-23T02:12:19.000Z"), // months old
    paidHours: 24.5,
    grossHours: 24.5,
    hoursWorked: 24.5,
    breakMinutes: 0,
    clockInLatitude: null,
    clockInLongitude: null,
    clockOutLatitude: null,
    clockOutLongitude: null,
    breakStartedAt: null,
    breakEndedAt: null,
  };
  const recentOpen = {
    ...staleOpen,
    id: 900,
    clockIn: new Date(Date.now() - 60 * 60 * 1000), // 1h ago, within the window
  };

  // Honestly emulates Postgres filtering on clockIn >= cutoff.
  function filterableFindFirst(entry: typeof staleOpen | null) {
    return vi.fn().mockImplementation(({ where }: { where?: { clockIn?: { gte?: Date } } }) => {
      if (!entry) return Promise.resolve(null);
      const gte = where?.clockIn?.gte;
      if (gte && entry.clockIn < gte) return Promise.resolve(null);
      return Promise.resolve(entry);
    });
  }

  it("myActive returns a recent open entry with deterministic ordering", async () => {
    const prisma = { timeEntry: { findFirst: filterableFindFirst(recentOpen) } };
    const result = await callerWith(prisma).myActive();
    expect(result?.id).toBe(900);
    const call = prisma.timeEntry.findFirst.mock.calls[0]?.[0];
    expect(call.where.clockIn.gte).toBeInstanceOf(Date);
    expect(call.orderBy).toEqual({ clockIn: "desc" });
  });

  it("myActive never returns a stale historical open entry", async () => {
    const prisma = { timeEntry: { findFirst: filterableFindFirst(staleOpen) } };
    await expect(callerWith(prisma).myActive()).resolves.toBeNull();
    const cutoff = prisma.timeEntry.findFirst.mock.calls[0]?.[0].where.clockIn.gte as Date;
    expect(Date.now() - cutoff.getTime()).toBeLessThanOrEqual(16 * 3600 * 1000 + 1000);
  });

  it("a recent open entry blocks a new clockIn", async () => {
    const prisma = { timeEntry: { findFirst: filterableFindFirst(recentOpen), create: vi.fn() } };
    await expect(callerWith(prisma).clockIn({ lat: 41.7, lng: -70.7 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Already clocked in",
    });
    expect(prisma.timeEntry.create).not.toHaveBeenCalled();
  });

  it("a stale open entry does not block a new clockIn", async () => {
    const prisma = {
      timeEntry: { findFirst: filterableFindFirst(staleOpen), create: vi.fn().mockResolvedValue({ id: 901 }) },
      employeeHourlyRateHistory: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findUnique: vi.fn().mockResolvedValue({ hourlyRate: 25 }) },
    };
    await callerWith(prisma).clockIn({ lat: 41.7, lng: -70.7 });
    expect(prisma.timeEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.timeEntry.create.mock.calls[0]?.[0].data.userId).toBe(7);
  });

  it("clockOut updates a recent open entry", async () => {
    const prisma = {
      timeEntry: {
        findFirst: filterableFindFirst(recentOpen),
        update: vi.fn().mockResolvedValue({ ...recentOpen, clockOut: new Date() }),
      },
    };
    await callerWith(prisma).clockOut({});
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 900 } }));
  });

  it("clockOut refuses a stale entry and never overwrites its stored hours", async () => {
    const prisma = {
      timeEntry: { findFirst: filterableFindFirst(staleOpen), update: vi.fn() },
    };
    await expect(callerWith(prisma).clockOut({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Not clocked in",
    });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
    // Luis-style stored values remain untouched: no write occurred at all.
    expect(staleOpen.paidHours).toBe(24.5);
    expect(staleOpen.grossHours).toBe(24.5);
    expect(staleOpen.hoursWorked).toBe(24.5);
  });

  it("startBreak cannot attach a break to a stale entry", async () => {
    const prisma = {
      timeEntry: { findFirst: filterableFindFirst(staleOpen), update: vi.fn() },
    };
    await expect(callerWith(prisma).startBreak()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Not clocked in",
    });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("endBreak cannot attach a break to a stale entry", async () => {
    const prisma = {
      timeEntry: { findFirst: filterableFindFirst(staleOpen), update: vi.fn() },
    };
    await expect(callerWith(prisma).endBreak()).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Not clocked in",
    });
    expect(prisma.timeEntry.update).not.toHaveBeenCalled();
  });

  it("startBreak still works on a recent active entry", async () => {
    const prisma = {
      timeEntry: {
        findFirst: filterableFindFirst(recentOpen),
        update: vi.fn().mockResolvedValue({ ...recentOpen, breakStartedAt: new Date() }),
      },
    };
    await callerWith(prisma).startBreak();
    expect(prisma.timeEntry.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 900 } }));
  });
});
