export function normalizeExpenseCategory(category: string): "paint" | "materials" | "labor" | "tools" | "equipment" | "rentals" | "fuel" | "subcontractor" | "travel" | "ferry" | "payroll_related" | "office" | "advertising" | "insurance" | "vehicle" | "meals" | "other" {
  const key = category.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "paint" || key === "materials") return key;
  if (key === "labor") return "labor";
  if (key === "tools" || key === "equipment" || key === "rentals") return key;
  if (key === "subcontractor" || key === "subcontractors") return "subcontractor";
  if (key === "travel" || key === "ferry" || key === "fuel") return key;
  if (key === "payroll_related" || key === "office" || key === "advertising" || key === "insurance" || key === "vehicle" || key === "meals") return key;
  return "other";
}
