import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { authenticate, signSession, setSessionCookie, clearSessionCookie, hashPassword, verifyPassword } from "@/lib/auth";
import { clearLoginFailures, isLoginRateLimited, recordFailedLogin } from "@/lib/login-rate-limit";

function clientIp(ctx: { req?: Request }): string | null {
  const forwarded = ctx.req?.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errorCode?: unknown; message?: unknown; cause?: unknown };
  if (candidate.code === "P1001" || candidate.errorCode === "P1001" ||
      candidate.code === "P1002" || candidate.errorCode === "P1002" ||
      candidate.code === "P1017" || candidate.errorCode === "P1017") {
    return true;
  }
  if (typeof candidate.message === "string" && /can't reach database server/i.test(candidate.message)) {
    return true;
  }
  return candidate.cause ? isDatabaseUnavailable(candidate.cause) : false;
}

async function authenticateWithDatabaseWakeRetry(email: string, password: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await authenticate(email, password);
    } catch (error) {
      if (!isDatabaseUnavailable(error) || attempt === 2) throw error;
      // Neon Free may need a moment to wake after its five-minute idle suspend.
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
  }
  return null;
}

export const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.session),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1).max(128),
      newPassword: z.string().min(8, "Use at least 8 characters.").max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.currentPassword === input.newPassword) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a new password different from your current one." });
      }

      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.session.userId },
        select: { id: true, password: true, isActive: true },
      });
      if (!user?.isActive || !(await verifyPassword(input.currentPassword, user.password))) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
      }

      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { password: await hashPassword(input.newPassword) },
      });
      return { ok: true };
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const ip = clientIp(ctx);
      if (isLoginRateLimited(input.email, ip)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed attempts. Please try again later." });
      }
      let user;
      try {
        user = await authenticateWithDatabaseWakeRetry(input.email, input.password);
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "The CRM database is waking up. Please try again in a few seconds.",
        });
      }
      if (!user) {
        recordFailedLogin(input.email, ip);
        // Generic message prevents account enumeration; never echo inputs.
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      clearLoginFailures(input.email, ip);
      const token = signSession({
        userId: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
      });
      await setSessionCookie(token);
      return { ok: true, role: user.role };
    }),

  logout: publicProcedure.mutation(async () => {
    clearSessionCookie();
    return { ok: true };
  }),
});
