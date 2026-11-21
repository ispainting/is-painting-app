export const CLOCK_IN_NOT_AT_JOBSITE = "not_at_jobsite";

/** Clock-In job list auto-refresh cadence: every hour. */
export const CLOCKABLE_REFETCH_INTERVAL_MS = 60 * 60 * 1000;

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


export const JOBSITE_RADIUS_METERS = 402.336; // 0.25 mile

export type Coordinates = { lat: number; lng: number };

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusMeters = 6_371_000;
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const deltaLat = radians(to.lat - from.lat);
  const deltaLng = radians(to.lng - from.lng);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isOutsideJobsite(employee: Coordinates, job: Coordinates, radiusMeters = JOBSITE_RADIUS_METERS): boolean {
  return distanceMeters(employee, job) > radiusMeters;
}

export function formatOffsiteReason(reason: string, distance: number | null): string {
  const prefix = distance == null
    ? "Authorized away from jobsite"
    : `Authorized ${(distance / 1609.344).toFixed(2)} mi from jobsite`;
  return `${prefix}: ${reason.trim()}`;
}
