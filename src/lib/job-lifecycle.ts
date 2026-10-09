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
  return value.toISOString().slice(0, 10);
}
