export function timeEntryRangeError(clockIn: Date, clockOut: Date | null, now = new Date()) {
  if (Number.isNaN(clockIn.getTime())) return "Clock-in date and time are invalid";
  if (clockIn > now) return "Clock-in cannot be in the future";
  if (clockOut && (Number.isNaN(clockOut.getTime()) || clockOut <= clockIn)) {
    return "Clock-out must be after clock-in";
  }
  return null;
}

export function timeRangesOverlap(
  first: { clockIn: Date; clockOut: Date | null },
  second: { clockIn: Date; clockOut: Date | null },
) {
  const firstEnd = first.clockOut?.getTime() ?? Number.POSITIVE_INFINITY;
  const secondEnd = second.clockOut?.getTime() ?? Number.POSITIVE_INFINITY;
  return first.clockIn.getTime() < secondEnd && second.clockIn.getTime() < firstEnd;
}
