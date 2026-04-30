import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { prisma } from "@/lib/db";
import { getSession, verifySession, COOKIE_NAME, type SessionPayload } from "@/lib/auth";

export type Context = {
  prisma: typeof prisma;
  session: SessionPayload | null;
  req?: Request;
};

function parseCookieFromHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  const found = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

export async function createContext(opts?: { req?: Request }): Promise<Context> {
  let session: SessionPayload | null = null;
  try {
    session = await getSession();
  } catch {
    // next/headers cookies() unavailable — fall back to request header
  }
  if (!session && opts?.req) {
    const token = parseCookieFromHeader(opts.req.headers.get("cookie"), COOKIE_NAME);
    if (token) session = verifySession(token);
  }
  return { prisma, session, req: opts?.req };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const adminProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ctx.session.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx: { ...ctx, session: ctx.session } });
});
