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
  /** Optional per-item override for the Proposal material markup default. */
  defaultMarkupPercent: z.number().min(0).nullable().optional(),
  coveragePerUnit: z.number().positive().nullable().optional(),
  defaultWastePercent: z.number().min(0).default(0),
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

  priceHistory: protectedProcedure
    .input(z.object({ inventoryItemId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.prisma.inventoryItem.findUnique({
        where: { id: input.inventoryItemId },
        select: { id: true, name: true, costPerUnit: true, supplier: true },
      });
      if (!item) {
        throw new Error("Inventory item not found.");
      }

      const matches = await ctx.prisma.expenseLineItem.findMany({
        where: {
          OR: [
            { description: { contains: item.name, mode: "insensitive" } },
            { expense: { description: { contains: item.name, mode: "insensitive" } } },
            { expense: { vendor: { contains: item.name, mode: "insensitive" } } },
          ],
        },
        include: {
          expense: {
            select: {
              id: true,
              vendor: true,
              description: true,
              expenseDate: true,
              amount: true,
              receiptNumber: true,
              attachments: {
                orderBy: { uploadedAt: "desc" },
                take: 1,
                select: { id: true, originalFilename: true, uploadedAt: true },
              },
            },
          },
        },
        orderBy: { expense: { expenseDate: "desc" } },
        take: 10,
      });

      return {
        inventoryItemId: item.id,
        itemName: item.name,
        latestKnownPrice: Number(item.costPerUnit),
        history: matches.map((line) => {
          const quantity = line.quantity == null ? null : Number(line.quantity);
          const total = line.total == null ? null : Number(line.total);
          const unitPrice = line.unitPrice != null
            ? Number(line.unitPrice)
            : quantity != null && quantity > 0 && total != null
              ? total / quantity
              : null;

          return {
            expenseId: line.expenseId,
            expenseLineItemId: line.id,
            description: line.description,
            quantity,
            total,
            unitPrice: unitPrice == null ? null : Number(unitPrice.toFixed(2)),
            vendor: line.expense.vendor,
            expenseDate: line.expense.expenseDate,
            receiptNumber: line.expense.receiptNumber,
            attachment: line.expense.attachments[0] ?? null,
          };
        }),
      };
    }),

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
