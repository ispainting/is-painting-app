import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));

import { authenticate } from "./auth";

const ADMIN_PASSWORD = "synthetic-admin-passphrase";

let adminPasswordHash: string;

beforeAll(async () => {
  adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
});

beforeEach(() => {
  mocks.findUnique.mockReset();
});

function employeeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    email: "synthetic-employee@example.test",
    name: "Synthetic Employee",
    role: "employee",
    isActive: true,
    password: adminPasswordHash,
    phone: "(508) 555-1234",
    ...overrides,
  };
}

describe("authenticate", () => {
  it("logs an employee in with email + digits-only phone PIN", async () => {
    mocks.findUnique.mockResolvedValue(employeeUser());
    const user = await authenticate("synthetic-employee@example.test", "5085551234");
    expect(user?.id).toBe(7);
  });

  it("accepts a formatted phone PIN after normalization", async () => {
    mocks.findUnique.mockResolvedValue(employeeUser());
    const user = await authenticate("synthetic-employee@example.test", "(508) 555-1234");
    expect(user?.id).toBe(7);
  });

  it("rejects a wrong phone number", async () => {
    mocks.findUnique.mockResolvedValue(employeeUser());
    await expect(authenticate("synthetic-employee@example.test", "5085559999")).resolves.toBeNull();
  });

  it("rejects employee login when no phone number is on file", async () => {
    mocks.findUnique.mockResolvedValue(employeeUser({ phone: null }));
    await expect(authenticate("synthetic-employee@example.test", "5085551234")).resolves.toBeNull();
  });

  it("rejects employee login when the stored phone has an invalid length", async () => {
    mocks.findUnique.mockResolvedValue(employeeUser({ phone: "555-12" }));
    await expect(authenticate("synthetic-employee@example.test", "55512")).resolves.toBeNull();
  });

  it("never lets an administrator authenticate with the phone fallback", async () => {
    mocks.findUnique.mockResolvedValue(
      employeeUser({ id: 1, role: "admin", email: "synthetic-admin@example.test", phone: "(508) 555-1234" })
    );
    await expect(authenticate("synthetic-admin@example.test", "5085551234")).resolves.toBeNull();
  });

  it("still lets an administrator log in with the bcrypt password", async () => {
    mocks.findUnique.mockResolvedValue(employeeUser({ id: 1, role: "admin", email: "synthetic-admin@example.test" }));
    const user = await authenticate("synthetic-admin@example.test", ADMIN_PASSWORD);
    expect(user?.id).toBe(1);
  });

  it("rejects inactive and unknown accounts", async () => {
    mocks.findUnique.mockResolvedValue(employeeUser({ isActive: false }));
    await expect(authenticate("synthetic-employee@example.test", "5085551234")).resolves.toBeNull();
    mocks.findUnique.mockResolvedValue(null);
    await expect(authenticate("nobody@example.test", "5085551234")).resolves.toBeNull();
  });
});
