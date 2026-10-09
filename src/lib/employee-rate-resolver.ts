import type { PrismaClient } from "@prisma/client";

type RateResolverPrisma = Pick<PrismaClient, "employeeHourlyRateHistory" | "user">;

/**
 * Resolves the hourly rate in effect for a user at a given moment, preferring
 * the most recent effective-dated history row and falling back to the user's
 * current rate only when no history exists.
 */
export async function resolveEffectiveHourlyRate(
  prisma: RateResolverPrisma,
  userId: number,
  atDate: Date
): Promise<number | null> {
  const historyRow = await prisma.employeeHourlyRateHistory.findFirst({
    where: { userId, effectiveFrom: { lte: atDate } },
    orderBy: { effectiveFrom: "desc" },
    select: { hourlyRate: true },
  });
  if (historyRow) return Number(historyRow.hourlyRate);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { hourlyRate: true } });
  return user?.hourlyRate == null ? null : Number(user.hourlyRate);
}

/**
 * Resolves a "YYYY-MM-DD" business date to the instant of local midnight in
 * Massachusetts (America/New_York), independent of the server or client's own
 * timezone. A bare date string parsed as UTC would shift the pay-rate
 * boundary by several hours; this anchors it to the correct local wall clock.
 */
export function startOfBusinessDayInMassachusetts(dateOnly: string, timeZone = "America/New_York"): Date {
  const utcGuess = new Date(`${dateOnly}T00:00:00Z`);
  if (Number.isNaN(utcGuess.getTime())) {
    throw new Error(`Invalid business date: ${dateOnly}`);
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(utcGuess)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }

  const wallClockAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offsetMs = wallClockAsUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

/**
 * True when a time entry's stored hourlyRateSnapshot must be recomputed:
 * only when the employee or clock-in date changes. Editing unrelated fields
 * (notes, review status, etc.) must preserve the existing snapshot.
 */
export function shouldRecomputeHourlyRateSnapshot(
  existing: { userId: number; clockIn: Date } | null,
  next: { userId: number; clockIn: Date }
): boolean {
  if (!existing) return true;
  return existing.userId !== next.userId || existing.clockIn.getTime() !== next.clockIn.getTime();
}
