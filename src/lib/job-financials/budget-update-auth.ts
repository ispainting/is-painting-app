import { TRPCError } from "@trpc/server";

export function assertCanUpdateJobBudget(session: { role: string } | null | undefined) {
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (session.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
}
