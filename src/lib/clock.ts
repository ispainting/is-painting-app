export const CLOCK_IN_NOT_AT_JOBSITE = "not_at_jobsite";

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

