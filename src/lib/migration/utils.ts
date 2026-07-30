export function normalizeLegacyId(value: string | number): string {
  return String(value).trim();
}

export function uniqueByLegacyId<T extends { id: string | number }>(rows: T[]): { unique: T[]; duplicates: T[] } {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicates: T[] = [];

  for (const row of rows) {
    const legacyId = normalizeLegacyId(row.id);
    if (seen.has(legacyId)) {
      duplicates.push(row);
      continue;
    }
    seen.add(legacyId);
    unique.push(row);
  }

  return { unique, duplicates };
}
