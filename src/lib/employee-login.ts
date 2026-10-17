/**
 * Employee clock-login helpers.
 *
 * Employees authenticate with their company email and a PIN equal to their
 * phone number, digits only. Both the entered value and the stored phone are
 * normalized through the same digits-only helper so "(508) 555-1234",
 * "508-555-1234", and "5085551234" are equivalent.
 *
 * Never log or return raw phone numbers or entered PINs from these helpers.
 */
export const EMPLOYEE_PIN_LENGTH = 10;

export function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function isValidEmployeePin(digits: string): boolean {
  return digits.length === EMPLOYEE_PIN_LENGTH;
}

/**
 * True when the entered value, normalized to digits only, matches the stored
 * phone's digits. Returns false when the employee has no usable phone PIN.
 */
export function phonePinMatches(entered: string, storedPhone: string | null | undefined): boolean {
  const stored = digitsOnly(storedPhone);
  if (!isValidEmployeePin(stored)) return false;
  const pin = digitsOnly(entered);
  return pin.length > 0 && pin === stored;
}

export type EmployeeLoginIssueKind =
  | "missing_email"
  | "missing_phone"
  | "invalid_phone_length"
  | "duplicate_phone";

export type EmployeeLoginIssue = {
  userId: number;
  name: string;
  kind: EmployeeLoginIssueKind;
};

/**
 * Read-only diagnostic over synthetic or real user rows. Returns user IDs and
 * names only — never emails or phone numbers — so results are safe to display.
 */
export function findEmployeeLoginIssues(
  users: Array<{ id: number; name: string; email: string | null; phone: string | null; role: string }>
): EmployeeLoginIssue[] {
  const issues: EmployeeLoginIssue[] = [];
  const phoneOwners = new Map<string, Array<{ id: number; name: string }>>();

  for (const user of users) {
    if (user.role !== "employee") continue;
    if (!user.email || !user.email.trim()) {
      issues.push({ userId: user.id, name: user.name, kind: "missing_email" });
    }
    const digits = digitsOnly(user.phone);
    if (digits.length === 0) {
      issues.push({ userId: user.id, name: user.name, kind: "missing_phone" });
      continue;
    }
    if (!isValidEmployeePin(digits)) {
      issues.push({ userId: user.id, name: user.name, kind: "invalid_phone_length" });
      continue;
    }
    const owners = phoneOwners.get(digits) ?? [];
    owners.push({ id: user.id, name: user.name });
    phoneOwners.set(digits, owners);
  }

  for (const owners of phoneOwners.values()) {
    if (owners.length < 2) continue;
    for (const owner of owners) {
      issues.push({ userId: owner.id, name: owner.name, kind: "duplicate_phone" });
    }
  }

  return issues;
}

/** Role-based landing page after login. */
export function postLoginRedirectPath(role: string): "/dashboard" | "/clock" {
  return role === "admin" ? "/dashboard" : "/clock";
}
