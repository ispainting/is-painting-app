/**
 * ============================================================================
 * PAYROLL ENGINE — Commit 1 (Foundation)
 * ============================================================================
 *
 * Single source of truth for all time-tracking math.
 *
 * PRINCIPLES (do not violate):
 *   1. PURE — no Prisma imports, no database access, no I/O
 *   2. DETERMINISTIC — same input always produces same output
 *   3. IDEMPOTENT — running computeEntry twice on the same input produces
 *      identical results (no hidden state, no random values)
 *   4. EXACT TIMESTAMPS PRESERVED — raw clock/break/GPS timestamps are never
 *      modified by this engine. Only ROUNDED timestamps are computed.
 *   5. UI-INDEPENDENT — the engine produces typed identifiers, not display
 *      text. UI code is responsible for translating identifiers to labels.
 *
 * STATUS:
 *   This file has zero consumers in Commit 1. It is foundation only.
 *   Commit 3 integrates the engine into the time router.
 *
 * PUBLIC API (intentionally minimal):
 *   Constants:    CALC_VERSION, PAYROLL_CONFIG, AttendanceFlag
 *   Types:        PayrollConfig, AttendanceFlag, TimeEntryInput, ComputedEntry
 *   Functions:    computeEntry, shouldShowLunchReminder
 *
 * Every other symbol is INTERNAL. Do not add new exports unless an external
 * caller genuinely needs them.
 *
 * VERSIONING:
 *   CALC_VERSION is bumped whenever the math changes. Entries are tagged
 *   with the version that computed them.
 *
 * CONFIGURATION:
 *   PAYROLL_CONFIG holds all tunable values. A future Settings build can
 *   replace these values with values from the Config table without changing
 *   any function signature.
 * ============================================================================
 */

// ============================================================================
// VERSION
// ============================================================================

/**
 * Identifier for the active calculation algorithm. Bumped whenever the math
 * inside the engine changes in a way that would alter results for the same
 * input. Stored on each computed entry for audit and report-time filtering.
 *
 * @remarks Increment when (and only when) business rules change. Never on
 * refactors that preserve numeric output.
 */
export const CALC_VERSION = 1;

// ============================================================================
// PAYROLL CONFIG
// ============================================================================

/**
 * Tunable parameters consumed by the engine. Each field controls one specific
 * rule. A future Settings build will source these values from the database
 * instead of using the default constant.
 */
export interface PayrollConfig {
  /** Granularity for payroll-time rounding, in minutes. Default: 5. */
  roundToMinutes: number;
  /** Standard unpaid lunch break, in minutes. Default: 30. */
  standardBreakMinutes: number;
  /**
   * Grace window above the standard break. Breaks lasting up to
   * `standardBreakMinutes + breakGraceMinutes` still deduct only the
   * standard amount. Default: 5.
   */
  breakGraceMinutes: number;
  /**
   * Hours clocked in before the first lunch reminder is shown to the worker.
   * Default: 5.
   */
  lunchReminderHours: number;
  /**
   * Cadence in minutes for repeating the lunch reminder after the first one
   * has been shown. Default: 15.
   */
  lunchReminderRepeatMinutes: number;
  /**
   * Break duration above which the LONG_LUNCH attendance flag is set.
   * Default: 60.
   */
  longLunchThresholdMinutes: number;
  /**
   * Gross-hour threshold above which a closed shift with no recorded break
   * earns the MISSING_BREAK attendance flag. Default: 5.
   */
  missingBreakThresholdHours: number;
}

/**
 * Default configuration used when callers do not pass an explicit `PayrollConfig`.
 * These defaults match I.S Painting's current operating rules.
 */
export const PAYROLL_CONFIG: PayrollConfig = {
  roundToMinutes: 5,
  standardBreakMinutes: 30,
  breakGraceMinutes: 5,
  lunchReminderHours: 5,
  lunchReminderRepeatMinutes: 15,
  longLunchThresholdMinutes: 60,
  missingBreakThresholdHours: 5,
};

// ============================================================================
// ATTENDANCE FLAGS
// ============================================================================

/**
 * Canonical attendance flag identifiers. Used across the entire application:
 * the engine emits them, the database stores them as JSON string arrays, the
 * UI maps them to human-readable labels and colors.
 *
 * Active identifiers returned by the engine today:
 *   - `ON_TIME`              default for a clean closed shift
 *   - `LONG_LUNCH`           break duration above `longLunchThresholdMinutes`
 *   - `MISSING_GPS`          missing coordinates at clock-in or clock-out
 *   - `MANUAL_OVERRIDE`      entry created or edited by an admin
 *   - `MISSING_CLOCK_OUT`    shift is still open
 *   - `MISSING_BREAK`        long closed shift with no break taken
 *
 * Reserved future identifiers — declared here for type stability but never
 * emitted by the current engine:
 *   - `OUTSIDE_GEOFENCE`     future geofencing build
 *   - `LATE_ARRIVAL`         future scheduling build
 *   - `EARLY_DEPARTURE`      future scheduling build
 */
export const AttendanceFlag = {
  ON_TIME: "ON_TIME",
  LONG_LUNCH: "LONG_LUNCH",
  MISSING_GPS: "MISSING_GPS",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
  MISSING_CLOCK_OUT: "MISSING_CLOCK_OUT",
  MISSING_BREAK: "MISSING_BREAK",
  OUTSIDE_GEOFENCE: "OUTSIDE_GEOFENCE",
  LATE_ARRIVAL: "LATE_ARRIVAL",
  EARLY_DEPARTURE: "EARLY_DEPARTURE",
} as const;

/** Union of all valid attendance flag identifiers. */
export type AttendanceFlag = (typeof AttendanceFlag)[keyof typeof AttendanceFlag];

// ============================================================================
// PUBLIC TYPES
// ============================================================================

/**
 * Plain input describing a single time entry. The engine works purely from
 * these fields — no Prisma types, no database row, no I/O. Callers are
 * responsible for projecting their own data into this shape.
 */
export interface TimeEntryInput {
  /** Raw clock-in timestamp. Never modified by the engine. */
  clockIn: Date;
  /** Raw clock-out timestamp, or `null` if the shift is still open. */
  clockOut: Date | null;
  /** Raw break-start timestamp, or `null` if no break was taken. */
  breakStartedAt: Date | null;
  /** Raw break-end timestamp, or `null` if break is in progress or not taken. */
  breakEndedAt: Date | null;
  /** Latitude captured at clock-in, or `null` if GPS missing. */
  clockInLatitude: number | null;
  /** Longitude captured at clock-in, or `null` if GPS missing. */
  clockInLongitude: number | null;
  /** Latitude captured at clock-out, or `null` if GPS missing/shift open. */
  clockOutLatitude: number | null;
  /** Longitude captured at clock-out, or `null` if GPS missing/shift open. */
  clockOutLongitude: number | null;
  /** True if this entry was created or modified by an admin. */
  isManual: boolean;
}

/**
 * Output of {@link computeEntry}. Every field is derived from the input;
 * callers write these directly back to the corresponding TimeEntry row.
 */
export interface ComputedEntry {
  /** Clock-in rounded to the configured payroll granularity. */
  roundedClockIn: Date;
  /** Clock-out rounded to the payroll granularity, or `null` if shift open. */
  roundedClockOut: Date | null;
  /** Break-start rounded, or `null` if no break. */
  roundedBreakStartedAt: Date | null;
  /** Break-end rounded, or `null` if break in progress or not taken. */
  roundedBreakEndedAt: Date | null;
  /** Whole-minute break duration based on rounded times, or `null`. */
  breakDurationMinutes: number | null;
  /** Minutes to subtract from gross hours for payroll. */
  breakDeductionMinutes: number;
  /**
   * Minutes the break ran past the `standardBreakMinutes + breakGraceMinutes`
   * threshold. Reporting only; not used in payroll math.
   */
  lateBreakMinutes: number;
  /** Hours between rounded clock-in and clock-out, or `null` if open. */
  grossHours: number | null;
  /** Gross hours minus break deduction, in hours. `null` if shift open. */
  paidHours: number | null;
  /** Computed attendance flags for this entry. */
  flags: AttendanceFlag[];
  /** Version of the calculation algorithm that produced this output. */
  calcVersion: number;
}

// ============================================================================
// INTERNAL HELPERS (not exported)
// ============================================================================

/** Round a Date to the nearest `config.roundToMinutes` minutes. */
function roundToNearestPayrollMinute(date: Date, config: PayrollConfig): Date {
  const ms = config.roundToMinutes * 60 * 1000;
  return new Date(Math.round(date.getTime() / ms) * ms);
}

/** Whole minutes between two Dates. Returns `null` if either is `null`. */
function minutesBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/** Break duration in minutes from rounded start/end. */
function computeBreakDuration(
  roundedStart: Date | null,
  roundedEnd: Date | null
): number | null {
  return minutesBetween(roundedStart, roundedEnd);
}

/**
 * Payroll break deduction in minutes. See module docstring for the table of
 * inputs and outputs.
 */
function computeBreakDeduction(
  durationMinutes: number | null,
  config: PayrollConfig
): number {
  if (durationMinutes === null || durationMinutes <= 0) return 0;
  const threshold = config.standardBreakMinutes + config.breakGraceMinutes;
  if (durationMinutes <= threshold) {
    return config.standardBreakMinutes;
  }
  return durationMinutes;
}

/** Minutes past the (standard + grace) break threshold. Reporting only. */
function computeLateBreakMinutes(
  durationMinutes: number | null,
  config: PayrollConfig
): number {
  if (durationMinutes === null) return 0;
  const threshold = config.standardBreakMinutes + config.breakGraceMinutes;
  return Math.max(0, durationMinutes - threshold);
}

/** Hours between rounded clock-in and rounded clock-out. `null` if open. */
function computeGrossHours(
  roundedClockIn: Date,
  roundedClockOut: Date | null
): number | null {
  if (!roundedClockOut) return null;
  const ms = roundedClockOut.getTime() - roundedClockIn.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/** Paid hours: gross hours minus break deduction. `null` if open. */
function computePaidHours(
  grossHours: number | null,
  breakDeductionMinutes: number
): number | null {
  if (grossHours === null) return null;
  const paidHours = grossHours - breakDeductionMinutes / 60;
  return Math.max(0, Math.round(paidHours * 100) / 100);
}

/** Compute attendance flags from input + already-derived break duration. */
function computeFlags(
  input: TimeEntryInput,
  breakDurationMinutes: number | null,
  config: PayrollConfig
): AttendanceFlag[] {
  const flags: AttendanceFlag[] = [];

  if (!input.clockOut) {
    flags.push(AttendanceFlag.MISSING_CLOCK_OUT);
  }

  const missingClockInGps =
    input.clockInLatitude === null || input.clockInLongitude === null;
  const missingClockOutGps =
    input.clockOut !== null &&
    (input.clockOutLatitude === null || input.clockOutLongitude === null);
  if (missingClockInGps || missingClockOutGps) {
    flags.push(AttendanceFlag.MISSING_GPS);
  }

  if (input.isManual) {
    flags.push(AttendanceFlag.MANUAL_OVERRIDE);
  }

  if (input.clockOut && !input.breakStartedAt) {
    const grossHours = computeGrossHours(input.clockIn, input.clockOut) ?? 0;
    if (grossHours >= config.missingBreakThresholdHours) {
      flags.push(AttendanceFlag.MISSING_BREAK);
    }
  }

  if (
    breakDurationMinutes !== null &&
    breakDurationMinutes > config.longLunchThresholdMinutes
  ) {
    flags.push(AttendanceFlag.LONG_LUNCH);
  }

  // ON_TIME is the default for closed shifts with no other flags
  if (input.clockOut && flags.length === 0) {
    flags.push(AttendanceFlag.ON_TIME);
  }

  return flags;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Compute every payroll-relevant value for a TimeEntry.
 *
 * This is the **single lifecycle entry point** for the rest of the
 * application. No other function in this file should be called externally.
 * Server routers (Commit 3+) follow this pattern:
 *
 *   1. Apply the mutation to a TimeEntry record in memory.
 *   2. Call `computeEntry(entry)` to get a `ComputedEntry`.
 *   3. Write the `ComputedEntry` fields back to the database row.
 *
 * @param input  Plain time-entry data. Raw timestamps are never modified.
 * @param config Optional config override. Defaults to `PAYROLL_CONFIG`.
 * @returns      All derived values for the entry, including rounded
 *               timestamps, break math, gross/paid hours, and flags.
 *
 * @remarks
 *   - **No side effects.** Pure function.
 *   - **Deterministic.** Same input always produces the same output.
 *   - **Idempotent.** Safe to call repeatedly on the same entry; useful when
 *     replaying calculations after a calc-version bump.
 *
 * @example
 *   const computed = computeEntry({
 *     clockIn: new Date("2025-06-09T08:00:00"),
 *     clockOut: new Date("2025-06-09T16:30:00"),
 *     breakStartedAt: new Date("2025-06-09T12:00:00"),
 *     breakEndedAt: new Date("2025-06-09T12:30:00"),
 *     clockInLatitude: 41.117,
 *     clockInLongitude: -73.408,
 *     clockOutLatitude: 41.117,
 *     clockOutLongitude: -73.408,
 *     isManual: false,
 *   });
 *   // computed.grossHours === 8.5
 *   // computed.paidHours  === 8
 *   // computed.flags      === ["ON_TIME"]
 */
export function computeEntry(
  input: TimeEntryInput,
  config: PayrollConfig = PAYROLL_CONFIG
): ComputedEntry {
  const roundedClockIn = roundToNearestPayrollMinute(input.clockIn, config);
  const roundedClockOut = input.clockOut
    ? roundToNearestPayrollMinute(input.clockOut, config)
    : null;
  const roundedBreakStartedAt = input.breakStartedAt
    ? roundToNearestPayrollMinute(input.breakStartedAt, config)
    : null;
  const roundedBreakEndedAt = input.breakEndedAt
    ? roundToNearestPayrollMinute(input.breakEndedAt, config)
    : null;

  const breakDurationMinutes = computeBreakDuration(
    roundedBreakStartedAt,
    roundedBreakEndedAt
  );

  const breakDeductionMinutes = computeBreakDeduction(breakDurationMinutes, config);
  const lateBreakMinutes = computeLateBreakMinutes(breakDurationMinutes, config);

  const grossHours = computeGrossHours(roundedClockIn, roundedClockOut);
  const paidHours = computePaidHours(grossHours, breakDeductionMinutes);

  const flags = computeFlags(input, breakDurationMinutes, config);

  return {
    roundedClockIn,
    roundedClockOut,
    roundedBreakStartedAt,
    roundedBreakEndedAt,
    breakDurationMinutes,
    breakDeductionMinutes,
    lateBreakMinutes,
    grossHours,
    paidHours,
    flags,
    calcVersion: CALC_VERSION,
  };
}

/**
 * Decide whether to show the lunch reminder to the worker right now.
 *
 * Reminder logic:
 *   - Fire the **first** reminder once the worker has been clocked in for
 *     at least `config.lunchReminderHours` AND no break has started.
 *   - Repeat every `config.lunchReminderRepeatMinutes` thereafter until a
 *     break starts.
 *   - Never fire once a break has been started.
 *   - Never fire on a closed shift.
 *
 * @param clockIn         The worker's clock-in time.
 * @param clockOut        Clock-out time, or `null` if shift is open.
 * @param breakStartedAt  Break start, or `null` if no break started.
 * @param lastReminderAt  When the last reminder was shown, or `null`.
 * @param now             Current time. Defaults to `new Date()`.
 * @param config          Optional config override. Defaults to `PAYROLL_CONFIG`.
 * @returns               `true` if the reminder should be shown now.
 *
 * @remarks
 *   - **No side effects.** Pure function.
 *   - **Deterministic** for any fixed `now` value.
 *   - The caller (client component) is responsible for tracking
 *     `lastReminderAt` in component state — the server is stateless on this.
 *
 * @example
 *   // Inside a setInterval(60_000):
 *   if (shouldShowLunchReminder(clockIn, null, null, lastReminderAt)) {
 *     showLunchReminderToast();
 *     setLastReminderAt(new Date());
 *   }
 */
export function shouldShowLunchReminder(
  clockIn: Date,
  clockOut: Date | null,
  breakStartedAt: Date | null,
  lastReminderAt: Date | null,
  now: Date = new Date(),
  config: PayrollConfig = PAYROLL_CONFIG
): boolean {
  if (clockOut) return false;
  if (breakStartedAt) return false;

  const hoursElapsed = (now.getTime() - clockIn.getTime()) / 3_600_000;
  if (hoursElapsed < config.lunchReminderHours) return false;

  if (!lastReminderAt) return true;

  const minutesSinceLast = (now.getTime() - lastReminderAt.getTime()) / 60_000;
  return minutesSinceLast >= config.lunchReminderRepeatMinutes;
}
