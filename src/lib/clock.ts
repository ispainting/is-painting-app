export const CLOCK_IN_NOT_AT_JOBSITE = "not_at_jobsite";

/**
 * Maximum length of a live shift. clockOut=null entries older than this are
 * historical import artifacts with authoritative stored hours — never live
 * shifts. Shared by the time router and the employee clock UI.
 */
export const MAX_LIVE_SHIFT_HOURS = 16;

export function liveShiftCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - MAX_LIVE_SHIFT_HOURS * 60 * 60 * 1000);
}

export function isWithinLiveShiftWindow(clockIn: Date | string, now: Date = new Date()): boolean {
  const value = typeof clockIn === "string" ? new Date(clockIn) : clockIn;
  return value.getTime() >= liveShiftCutoff(now).getTime();
}

export function formatClockDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

export function normalizeClockInJobId(selection: string | null | undefined): number | undefined {
  if (selection === null || selection === undefined || selection === "") {
    return undefined;
  }

  if (selection === CLOCK_IN_NOT_AT_JOBSITE) {
    return undefined;
  }

  const parsed = Number(selection);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

