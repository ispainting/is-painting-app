export const EMPLOYEE_CANONICAL_RESOLUTION: Record<string, string> = {
  // Approved duplicate legacy employee merge:
  // 2760001 (Robert Ferreira) -> 750006 (Robert Silva Ferreira)
  "2760001": "750006",
};

export function resolveCanonicalEmployeeLegacyId(legacyId: string): string {
  return EMPLOYEE_CANONICAL_RESOLUTION[legacyId] ?? legacyId;
}

export function isResolvedEmployeeAlias(legacyId: string): boolean {
  return legacyId in EMPLOYEE_CANONICAL_RESOLUTION;
}
