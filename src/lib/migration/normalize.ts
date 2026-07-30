const STATE_MAP: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

export function normalizeNullableString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function normalizeText(value: string | null | undefined): string | null {
  return normalizeNullableString(value);
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = normalizeNullableString(value);
  return normalized ? normalized.toLowerCase() : null;
}

export function normalizePhone(value: string | null | undefined): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return digits.length > 0 ? digits : null;
}

export function normalizeCity(value: string | null | undefined): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) return null;
  return normalized
    .split(/\s+/)
    .map((word) => word.split("-").map((piece) => piece ? piece[0].toUpperCase() + piece.slice(1).toLowerCase() : piece).join("-"))
    .join(" ");
}

export function normalizeState(value: string | null | undefined): string | null {
  const normalized = normalizeNullableString(value);
  if (!normalized) return null;
  if (normalized.length === 2) return normalized.toUpperCase();
  return STATE_MAP[normalized.toLowerCase()] ?? normalized.toUpperCase();
}

export function normalizeArray(values: Array<string | null | undefined> | null | undefined): string[] {
  if (!values) return [];
  return values.map((value) => normalizeNullableString(value)).filter((value): value is string => Boolean(value));
}

export function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeMoney(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

export function normalizeBoolean(value: boolean | null | undefined): boolean {
  return Boolean(value);
}
