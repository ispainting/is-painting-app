import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v || 0);
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function nextNumber(prefix: string, lastNumber: string | null | undefined) {
  if (!lastNumber) return `${prefix}-0001`;
  const n = parseInt(lastNumber.split("-")[1] || "0", 10) + 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

/**
 * Pricing engine.
 * subtotal = materials + labor
 * burden = subtotal * (wc + gl + overhead) / 100
 * marked = (subtotal + burden) * (1 + markup/100)
 * total = marked * (1 + tax/100)
 */
export function computeEstimate(args: {
  materials: number;
  labor: number;
  wc: number;
  gl: number;
  overhead: number;
  markup: number;
  tax: number;
}) {
  const subtotal = args.materials + args.labor;
  const burden = subtotal * ((args.wc + args.gl + args.overhead) / 100);
  const marked = (subtotal + burden) * (1 + args.markup / 100);
  const total = marked * (1 + args.tax / 100);
  return {
    subtotalBeforeMarkup: round2(subtotal + burden),
    totalEstimate: round2(total),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
