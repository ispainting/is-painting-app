import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertCanUpdateJobBudget } from "./budget-update-auth";

describe("assertCanUpdateJobBudget", () => {
  it("allows admin users", () => {
    expect(() => assertCanUpdateJobBudget({ role: "admin" })).not.toThrow();
  });

  it("rejects unauthorized user", () => {
    expect(() => assertCanUpdateJobBudget(null)).toThrowError(TRPCError);
    try {
      assertCanUpdateJobBudget(null);
    } catch (error) {
      expect((error as TRPCError).code).toBe("UNAUTHORIZED");
    }
  });

  it("rejects non-admin users", () => {
    expect(() => assertCanUpdateJobBudget({ role: "employee" })).toThrowError(TRPCError);
    try {
      assertCanUpdateJobBudget({ role: "employee" });
    } catch (error) {
      expect((error as TRPCError).code).toBe("FORBIDDEN");
    }
  });
});
