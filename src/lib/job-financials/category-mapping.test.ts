import { describe, expect, it } from "vitest";
import { mapExpenseCategoryToBudgetCategory } from "./category-mapping";

describe("mapExpenseCategoryToBudgetCategory", () => {
  it("maps approved six-budget model categories deterministically", () => {
    expect(mapExpenseCategoryToBudgetCategory("paint")).toBe("paint_materials");
    expect(mapExpenseCategoryToBudgetCategory("materials")).toBe("paint_materials");
    expect(mapExpenseCategoryToBudgetCategory("tools")).toBe("equipment_tools");
    expect(mapExpenseCategoryToBudgetCategory("equipment")).toBe("equipment_tools");
    expect(mapExpenseCategoryToBudgetCategory("rentals")).toBe("equipment_tools");
    expect(mapExpenseCategoryToBudgetCategory("subcontractor")).toBe("subcontractors");
    expect(mapExpenseCategoryToBudgetCategory("travel")).toBe("travel_ferry");
    expect(mapExpenseCategoryToBudgetCategory("ferry")).toBe("travel_ferry");
    expect(mapExpenseCategoryToBudgetCategory("fuel")).toBe("travel_ferry");
    expect(mapExpenseCategoryToBudgetCategory("labor")).toBe("labor");
  });

  it("routes non-job-overhead categories to other for phase 1", () => {
    expect(mapExpenseCategoryToBudgetCategory("office")).toBe("other");
    expect(mapExpenseCategoryToBudgetCategory("advertising")).toBe("other");
    expect(mapExpenseCategoryToBudgetCategory("insurance")).toBe("other");
    expect(mapExpenseCategoryToBudgetCategory("vehicle")).toBe("other");
    expect(mapExpenseCategoryToBudgetCategory("meals")).toBe("other");
    expect(mapExpenseCategoryToBudgetCategory("other")).toBe("other");
  });
});
