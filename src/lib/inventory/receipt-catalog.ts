import type { PrismaClient } from "@prisma/client";

const MATERIAL_CATEGORIES: Array<"paint" | "materials" | "tools" | "equipment" | "rentals"> = ["paint", "materials", "tools", "equipment", "rentals"];
const IGNORE_LINE = /\b(tax|sales tax|discount|coupon|deposit|delivery|shipping|freight|subtotal|total|fee|refund)\b/i;

type ReceiptLine = {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
  vendor: string | null;
  date: Date;
};

function normalizedName(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function inventoryCategory(description: string): "paint" | "primer" | "caulk" | "tape" | "tools" | "supplies" | "other" {
  const text = description.toLowerCase();
  if (/\bprimer\b/.test(text)) return "primer";
  if (/\bcaulk|sealant\b/.test(text)) return "caulk";
  if (/\b(tape|masking paper)\b/.test(text)) return "tape";
  if (/\b(brush|roller|sander|sprayer|ladder|scraper|knife|tool)\b/.test(text)) return "tools";
  if (/\b(paint|stain|enamel|urethane|sealer)\b/.test(text)) return "paint";
  return "supplies";
}

function inventoryUnit(description: string) {
  const text = description.toLowerCase();
  if (/\b(5\s*gal|five gallon|5-gallon|5 gallon|pail)\b/.test(text)) return "5-gallon pail";
  if (/\b(gallon|gal\.?|1\s*gal)\b/.test(text)) return "gallon";
  if (/\b(quart|qt\.?|1\s*qt)\b/.test(text)) return "quart";
  if (/\b(pint|pt\.?|1\s*pt)\b/.test(text)) return "pint";
  if (/\b(tube)\b/.test(text)) return "tube";
  if (/\b(roll)\b/.test(text)) return "roll";
  if (/\b(box|case|pack)\b/.test(text)) return "pack";
  if (/\b(square feet|sq\.?\s*ft)\b/.test(text)) return "sq ft";
  return "each";
}

function unitCost(line: { quantity: unknown; unitPrice: unknown; total: unknown }) {
  const quantity = line.quantity == null ? null : Number(line.quantity);
  const unitPrice = line.unitPrice == null ? null : Number(line.unitPrice);
  const total = line.total == null ? null : Number(line.total);
  if (unitPrice != null && Number.isFinite(unitPrice) && unitPrice > 0) return unitPrice;
  if (total != null && Number.isFinite(total) && total > 0 && quantity != null && quantity > 0) {
    return total / quantity;
  }
  if (total != null && Number.isFinite(total) && total > 0 && (quantity == null || quantity === 1)) return total;
  return null;
}

export async function syncReceiptLineItemsToInventory(prisma: PrismaClient, since = new Date(Date.now() - 183 * 24 * 60 * 60 * 1000)) {
  const expenses = await prisma.expense.findMany({
    where: {
      expenseDate: { gte: since },
      category: { in: MATERIAL_CATEGORIES },
      status: { not: "rejected" },
      duplicateStatus: "clear",
      reviewStatus: { in: ["reviewed", "approved"] },
    },
    select: {
      id: true,
      vendor: true,
      expenseDate: true,
      lineItems: { select: { description: true, quantity: true, unitPrice: true, total: true } },
    },
    orderBy: { expenseDate: "desc" },
    take: 5000,
  });

  const productLines: ReceiptLine[] = expenses.flatMap((expense) => expense.lineItems.map((line) => ({
    description: line.description.trim(),
    quantity: line.quantity == null ? null : Number(line.quantity),
    unitPrice: line.unitPrice == null ? null : Number(line.unitPrice),
    total: line.total == null ? null : Number(line.total),
    vendor: expense.vendor,
    date: expense.expenseDate,
  })));

  const candidates = new Map<string, ReceiptLine>();
  for (const line of productLines) {
    if (!line.description || IGNORE_LINE.test(line.description)) continue;
    const key = normalizedName(line.description);
    const cost = unitCost(line);
    if (!key || cost == null || cost > 10000) continue;
    const current = candidates.get(key);
    if (!current || line.date > current.date) candidates.set(key, line);
  }

  const activeItems = await prisma.inventoryItem.findMany({ where: { isActive: true } });
  const byName = new Map(activeItems.map((item) => [normalizedName(item.name), item]));
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [key, line] of candidates) {
    const cost = unitCost(line);
    if (cost == null) { skipped += 1; continue; }
    const existing = byName.get(key);
    if (existing) {
      const existingUpdatedDay = new Date(existing.updatedAt);
      existingUpdatedDay.setHours(0, 0, 0, 0);
      if (line.date >= existingUpdatedDay) {
        const refreshed = await prisma.inventoryItem.update({
          where: { id: existing.id },
          data: { costPerUnit: Number(cost.toFixed(2)), supplier: line.vendor ?? existing.supplier },
        });
        byName.set(key, refreshed);
        updated += 1;
      } else skipped += 1;
      continue;
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name: line.description.slice(0, 180),
        category: inventoryCategory(line.description),
        unit: inventoryUnit(line.description),
        costPerUnit: Number(cost.toFixed(2)),
        supplier: line.vendor,
        currentStock: 0,
        minStockLevel: 0,
        isActive: true,
      },
    });
    byName.set(key, item);
    created += 1;
  }

  return { scannedLines: productLines.length, uniqueItems: candidates.size, created, updated, skipped };
}
