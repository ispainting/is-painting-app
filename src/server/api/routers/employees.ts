import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { hashPassword } from "@/lib/auth";

export const employeesRouter = router({
  list: adminProcedure
    .input(z.object({ visibility: z.enum(["active", "inactive", "all"]).optional() }).optional())
    .query(({ ctx, input }) => {
      const visibility = input?.visibility ?? "active";
      const where: any = {};
      if (visibility === "active") where.isActive = true;
      if (visibility === "inactive") where.isActive = false;

      return ctx.prisma.user.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, email: true, role: true, phone: true,
          hourlyRate: true, isActive: true, createdAt: true,
        },
      });
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["admin", "employee"]).default("employee"),
      phone: z.string().optional(),
      hourlyRate: z.number().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const password = await hashPassword(input.password);
      return ctx.prisma.user.create({
        data: { ...input, password },
      });
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      data: z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        hourlyRate: z.number().min(0).optional(),
        role: z.enum(["admin", "employee"]).optional(),
        isActive: z.boolean().optional(),
      }),
    }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.user.update({ where: { id: input.id }, data: input.data })
    ),

  resetPassword: adminProcedure
    .input(z.object({ id: z.number(), password: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const password = await hashPassword(input.password);
      return ctx.prisma.user.update({ where: { id: input.id }, data: { password } });
    }),

  archive: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.user.update({ where: { id: input.id }, data: { isActive: false } })
  ),
});
