export function toMoney(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return round2(parsed);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sumMoney(values: number[]): number {
  return round2(values.reduce((sum, value) => sum + toMoney(value), 0));
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return round2((part / total) * 100);
}
