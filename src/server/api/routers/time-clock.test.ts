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

    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({ where: { userId: 7, clockOut: null } });
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

    expect(prisma.timeEntry.findFirst).toHaveBeenCalledWith({ where: { userId: 7, clockOut: null } });
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
