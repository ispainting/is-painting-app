import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { authenticate, signSession, setSessionCookie, clearSessionCookie, hashPassword, verifyPassword } from "@/lib/auth";
import { clearLoginFailures, isLoginRateLimited, recordFailedLogin } from "@/lib/login-rate-limit";

function clientIp(ctx: { req?: Request }): string | null {
  const forwarded = ctx.req?.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || null;
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
      const user = await authenticate(input.email, input.password);
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
