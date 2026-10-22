import { startOfBusinessDayInMassachusetts, todayDateInputValueInMassachusetts } from "./employee-rate-resolver";
import { z } from "zod";

export const businessDateSchema = z.preprocess((value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return startOfBusinessDayInMassachusetts(value);
  }
  return value;
}, z.coerce.date());

export type LifecycleDateSource = {
  leadReceivedAt?: Date | string | null;
  proposalSentAt?: Date | string | null;
  workStartedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export function getLifecycleDate(source: LifecycleDateSource, key: "leadReceivedAt" | "proposalSentAt" | "workStartedAt"): Date | null {
  const value = source[key];
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

export function getMonthKey(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 7);
}

export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  return todayDateInputValueInMassachusetts(value);
}

export function formatLifecycleDate(date: Date | string | null | undefined): string {
  if (!date) return "Not recorded";
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function parseLifecycleDateInput(dateOnly: string): Date | null {
  if (!dateOnly) return null;
  // Anchor to Massachusetts midnight so the saved day never shifts via UTC.
  return startOfBusinessDayInMassachusetts(dateOnly);
}
