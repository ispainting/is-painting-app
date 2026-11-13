// The inbox's rules that need no database: what a status does to the pipeline card, the counters at
// the top of the screen, and what "today" and "this week" mean for a business in Massachusetts.
import type { LeadStatus, OpportunityPipeline, OpportunityStage, OpportunityStatus } from "@prisma/client";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Novo",
  CONTACTED: "Contatado",
  REAL: "Real",
  NOT_REAL: "Não real",
  NO_ANSWER: "Não atendeu",
  WON: "Virou cliente",
  LOST: "Perdido",
};

export interface FunnelMove {
  pipeline: OpportunityPipeline;
  stage: OpportunityStage;
  status: OpportunityStatus;
}

// Work has started from here on, so a quick "Real" or "Não atendeu" can't pull the card back.
const PAST_FIRST_CONTACT = new Set<OpportunityStage>(["estimate_sent", "approval", "service_delivery", "review"]);
const AFTER_THE_SALE = new Set<OpportunityStage>(["service_delivery", "review"]);

/**
 * Where the pipeline card goes when a lead gets this status; null leaves it where it is. A lead that
 * was WON is being corrected, so its card comes back with it instead of staying won.
 */
export function funnelMove(status: LeadStatus, current: OpportunityStage, previous?: LeadStatus): FunnelMove | null {
  const early = (stage: OpportunityStage): FunnelMove | null =>
    PAST_FIRST_CONTACT.has(current) && previous !== "WON" ? null : { pipeline: "sales", stage, status: "open" };
  switch (status) {
    case "NEW":
      return null;
    case "CONTACTED":
      return early("onboarding");
    case "REAL":
      return early("follow_up");
    case "NO_ANSWER":
      return early("not_answered");
    case "NOT_REAL":
      return { pipeline: "not_interested", stage: "not_qualified", status: "lost" };
    case "LOST":
      return { pipeline: "not_interested", stage: "lost", status: "lost" };
    case "WON":
      return { pipeline: "sales", stage: AFTER_THE_SALE.has(current) ? current : "service_delivery", status: "won" };
  }
}

export interface LeadRates {
  /** Leads someone already judged. New or merely contacted leads don't pull the rates down. */
  judged: number;
  realPct: number | null;
  noAnswerPct: number | null;
}

export function leadRates(counts: Partial<Record<LeadStatus, number>>): LeadRates {
  const of = (status: LeadStatus) => counts[status] ?? 0;
  // A lost lead was a real customer who didn't hire.
  const real = of("REAL") + of("WON") + of("LOST");
  const judged = real + of("NOT_REAL") + of("NO_ANSWER");
  const pct = (n: number) => (judged ? Math.round((n / judged) * 100) : null);
  return { judged, realPct: pct(real), noAnswerPct: pct(of("NO_ANSWER")) };
}

export const BUSINESS_TIME_ZONE = "America/New_York";

function wallClock(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

// Midnight in Massachusetts on a calendar date. The offset is read at midnight itself, because on
// the days the clocks change the morning and the afternoon have different offsets.
function midnight(year: number, month: number, day: number): Date {
  const asUtc = Date.UTC(year, month - 1, day);
  const offsetAt = (instant: number) => {
    const w = wallClock(new Date(instant));
    return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - instant;
  };
  return new Date(asUtc - offsetAt(asUtc - offsetAt(asUtc)));
}

export function startOfBusinessDay(now: Date): Date {
  const { year, month, day } = wallClock(now);
  return midnight(year, month, day);
}

/** The week starts on Monday, like the Monday scorecard in CLAUDE.md §7. */
export function startOfBusinessWeek(now: Date): Date {
  const { year, month, day } = wallClock(now);
  const sinceMonday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return midnight(year, month, day - sinceMonday);
}

export type LeadPeriod = "today" | "7d" | "30d" | "90d" | "all";

export function periodStart(period: LeadPeriod, now: Date): Date | null {
  if (period === "all") return null;
  if (period === "today") return startOfBusinessDay(now);
  return new Date(now.getTime() - Number(period.slice(0, -1)) * 86_400_000);
}
