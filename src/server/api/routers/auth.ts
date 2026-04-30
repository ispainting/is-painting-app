import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { authenticate, signSession, setSessionCookie, clearSessionCookie } from "@/lib/auth";

export const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.session),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const user = await authenticate(input.email, input.password);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
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
