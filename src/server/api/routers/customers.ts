import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";

const customerInput = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const customersRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.customer.findMany({
        where: {
          deletedAt: null,
          ...(input?.search && {
            OR: [
              { name: { contains: input.search, mode: "insensitive" } },
              { email: { contains: input.search, mode: "insensitive" } },
              { phone: { contains: input.search } },
              { address: { contains: input.search, mode: "insensitive" } },
              { city: { contains: input.search, mode: "insensitive" } },
              { state: { contains: input.search, mode: "insensitive" } },
              { zipCode: { contains: input.search } },
            ],
          }),
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
    }),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
    ctx.prisma.customer.findUnique({
      where: { id: input.id },
      include: { jobs: true, opportunities: true, invoices: true },
    })
  ),

  create: adminProcedure.input(customerInput).mutation(({ ctx, input }) =>
    ctx.prisma.customer.create({
      data: { ...input, email: input.email || null },
    })
  ),

  update: adminProcedure
    .input(z.object({ id: z.number(), data: customerInput.partial() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.customer.update({ where: { id: input.id }, data: input.data })
    ),

  softDelete: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.customer.update({ where: { id: input.id }, data: { deletedAt: new Date() } })
  ),
});
