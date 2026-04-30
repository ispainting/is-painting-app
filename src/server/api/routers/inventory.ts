import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";

const CategoryZ = z.enum(["paint", "primer", "caulk", "tape", "tools", "supplies", "other"]);

const itemInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: CategoryZ,
  unit: z.string().min(1),
  costPerUnit: z.number().min(0),
  sellingPrice: z.number().min(0).optional(),
  currentStock: z.number().min(0).default(0),
  minStockLevel: z.number().min(0).default(0),
  supplier: z.string().optional(),
  sku: z.string().optional(),
});

export const inventoryRouter = router({
  list: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.prisma.inventoryItem.findMany({
        where: {
          isActive: true,
          ...(input?.search && {
            name: { contains: input.search, mode: "insensitive" },
          }),
        },
        orderBy: { name: "asc" },
      })
    ),

  byId: protectedProcedure.input(z.object({ id: z.number() })).query(({ ctx, input }) =>
    ctx.prisma.inventoryItem.findUnique({ where: { id: input.id } })
  ),

  create: adminProcedure.input(itemInput).mutation(({ ctx, input }) =>
    ctx.prisma.inventoryItem.create({ data: input })
  ),

  update: adminProcedure
    .input(z.object({ id: z.number(), data: itemInput.partial() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.inventoryItem.update({ where: { id: input.id }, data: input.data })
    ),

  adjustStock: adminProcedure
    .input(z.object({ id: z.number(), delta: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.prisma.inventoryItem.findUnique({ where: { id: input.id } });
      if (!item) throw new Error("Not found");
      return ctx.prisma.inventoryItem.update({
        where: { id: input.id },
        data: { currentStock: Number(item.currentStock) + input.delta },
      });
    }),

  archive: adminProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) =>
    ctx.prisma.inventoryItem.update({ where: { id: input.id }, data: { isActive: false } })
  ),
});
