import type { ExpenseCategory, JobBudgetCategory } from "./types";

const MAP: Record<ExpenseCategory, JobBudgetCategory> = {
  labor: "labor",
  paint: "paint_materials",
  materials: "paint_materials",
  tools: "equipment_tools",
  equipment: "equipment_tools",
  rentals: "equipment_tools",
  subcontractor: "subcontractors",
  travel: "travel_ferry",
  ferry: "travel_ferry",
  fuel: "travel_ferry",
  payroll_related: "other",
  office: "other",
  advertising: "other",
  insurance: "other",
  vehicle: "other",
  meals: "other",
  other: "other",
};

export function mapExpenseCategoryToBudgetCategory(category: ExpenseCategory): JobBudgetCategory {
  return MAP[category];
}
