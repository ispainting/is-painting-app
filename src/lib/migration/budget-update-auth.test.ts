import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertCanUpdateJobBudget } from "./budget-update-auth";

describe("assertCanUpdateJobBudget", () => {
  it("accepts admins and rejects non-admins", () => {
    expect(() => assertCanUpdateJobBudget({ role: "admin" })).not.toThrow();
    expect(() => assertCanUpdateJobBudget({ role: "employee" })).toThrowError(TRPCError);
    expect(() => assertCanUpdateJobBudget(null)).toThrowError(TRPCError);
  });
});
