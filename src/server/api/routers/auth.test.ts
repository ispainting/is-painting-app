import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  authenticate: mocks.authenticate,
  signSession: vi.fn(() => "signed-token"),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  getSession: vi.fn().mockResolvedValue(null),
  verifySession: vi.fn(() => null),
  COOKIE_NAME: "is_session",
}));

import { authRouter } from "./auth";
import { resetLoginRateLimitStore } from "@/lib/login-rate-limit";

function caller() {
  return authRouter.createCaller({ prisma: {} as never, session: null });
}

beforeEach(() => {
  mocks.authenticate.mockReset();
  resetLoginRateLimitStore();
});

describe("auth.login", () => {
  it("returns a generic error that never echoes the entered PIN", async () => {
    mocks.authenticate.mockResolvedValue(null);
    await expect(caller().login({ email: "synthetic@example.test", password: "5085551234" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid email or password",
    });
    try {
      await caller().login({ email: "synthetic@example.test", password: "5085551234" });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain("5085551234");
    }
  });

  it("rate-limits repeated failed attempts for the same email", async () => {
    mocks.authenticate.mockResolvedValue(null);
    const c = caller();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(c.login({ email: "synthetic@example.test", password: "wrong" })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    }
    await expect(c.login({ email: "synthetic@example.test", password: "wrong" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(mocks.authenticate).toHaveBeenCalledTimes(5);
  });

  it("does not lock out a different email on the same connection", async () => {
    mocks.authenticate.mockResolvedValue(null);
    const c = caller();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(c.login({ email: "first@example.test", password: "wrong" })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    }
    // A different account identity is still allowed to try.
    await expect(c.login({ email: "second@example.test", password: "wrong" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns the employee role on successful phone-PIN login and clears failures", async () => {
    mocks.authenticate
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 7, role: "employee", email: "synthetic@example.test", name: "Synthetic" });
    const c = caller();
    await expect(c.login({ email: "synthetic@example.test", password: "wrong" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(c.login({ email: "synthetic@example.test", password: "5085551234" })).resolves.toEqual({
      ok: true,
      role: "employee",
    });
    // Failure count was cleared: a new failure is not rate limited.
    mocks.authenticate.mockResolvedValue(null);
    await expect(c.login({ email: "synthetic@example.test", password: "wrong" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
