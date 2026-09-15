import { describe, expect, it } from "vitest";
import {
  computeMaterialLine,
  computeLaborLine,
  computeScopeEstimate,
  computeProposalTotals,
  buildJobEstimateFromProposal,
  resolveLaborSellRate,
  MissingLaborRateError,
  round2,
  calculateProductionHours,
  calculatePaintMaterialQuantity,
  calculateMarkupPrice,
  calculateGrossMarginPrice,
  calculateEffectiveSalesRate,
  normalizeProposalProjectName,
} from "./proposal-pricing";

describe("computeMaterialLine", () => {
  it("computes material cost and markup-based selling price", () => {
    const result = computeMaterialLine({ quantity: 5, unitCost: 40, markupPercent: 40 });
    expect(result.materialCost).toBe(200);
    expect(result.sellingPrice).toBe(280);
  });

  it("supports zero markup", () => {
    const result = computeMaterialLine({ quantity: 2, unitCost: 10, markupPercent: 0 });
    expect(result.materialCost).toBe(20);
    expect(result.sellingPrice).toBe(20);
  });

  it("rejects negative quantity, cost, or markup", () => {
    expect(() => computeMaterialLine({ quantity: -1, unitCost: 10, markupPercent: 0 })).toThrow();
    expect(() => computeMaterialLine({ quantity: 1, unitCost: -10, markupPercent: 0 })).toThrow();
    expect(() => computeMaterialLine({ quantity: 1, unitCost: 10, markupPercent: -5 })).toThrow();
  });
});

describe("computeLaborLine", () => {
  it("computes labor selling price from hours × sell rate", () => {
    const result = computeLaborLine({ hours: 24, sellRate: 75 });
    expect(result.sellingPrice).toBe(1800);
    expect(result.laborCost).toBeNull();
  });

  it("computes optional internal labor cost separately from selling price", () => {
    const result = computeLaborLine({ hours: 24, sellRate: 75, costRate: 30 });
    expect(result.sellingPrice).toBe(1800);
    expect(result.laborCost).toBe(720);
  });

  it("rejects negative hours or sell rate", () => {
    expect(() => computeLaborLine({ hours: -1, sellRate: 75 })).toThrow();
    expect(() => computeLaborLine({ hours: 1, sellRate: -75 })).toThrow();
  });
});

describe("computeScopeEstimate", () => {
  it("combines multiple materials and labor into one scope subtotal", () => {
    const result = computeScopeEstimate({
      materials: [
        { quantity: 5, unitCost: 40, markupPercent: 40 }, // 200 cost, 280 sell
        { quantity: 2, unitCost: 15, markupPercent: 20 }, // 30 cost, 36 sell
      ],
      labor: { hours: 24, sellRate: 75 }, // 1800 sell
      additionalCharges: 50,
    });

    expect(result.materialsCost).toBe(230);
    expect(result.materialsSellingPrice).toBe(316);
    expect(result.laborSellingPrice).toBe(1800);
    expect(result.additionalCharges).toBe(50);
    expect(result.subtotal).toBe(2166); // 1800 + 316 + 50
    expect(result.materialLines).toHaveLength(2);
  });

  it("supports a scope with no labor (materials only)", () => {
    const result = computeScopeEstimate({
      materials: [{ quantity: 1, unitCost: 100, markupPercent: 25 }],
      labor: null,
    });
    expect(result.laborSellingPrice).toBe(0);
    expect(result.laborCost).toBeNull();
    expect(result.subtotal).toBe(125);
  });

  it("supports a scope with no materials (labor only)", () => {
    const result = computeScopeEstimate({ materials: [], labor: { hours: 10, sellRate: 60 } });
    expect(result.materialsSellingPrice).toBe(0);
    expect(result.subtotal).toBe(600);
  });
});

describe("computeProposalTotals", () => {
  it("sums multiple scopes with no adjustments", () => {
    const result = computeProposalTotals({ scopeSubtotals: [2166, 600, 125] });
    expect(result.scopesSubtotal).toBe(2891);
    expect(result.total).toBe(2891);
  });

  it("applies a flat discount amount before tax", () => {
    const result = computeProposalTotals({ scopeSubtotals: [1000], discountAmount: 100, taxPercent: 10 });
    expect(result.afterDiscount).toBe(900);
    expect(result.taxAmount).toBe(90);
    expect(result.total).toBe(990);
  });

  it("applies a percent discount and combines with a flat discount", () => {
    const result = computeProposalTotals({ scopeSubtotals: [1000], discountPercent: 10, discountAmount: 50 });
    expect(result.discountApplied).toBe(150);
    expect(result.afterDiscount).toBe(850);
    expect(result.total).toBe(850);
  });

  it("never discounts below zero", () => {
    const result = computeProposalTotals({ scopeSubtotals: [100], discountAmount: 500 });
    expect(result.afterDiscount).toBe(0);
    expect(result.total).toBe(0);
  });
});

describe("buildJobEstimateFromProposal — proposal-to-job estimate preservation", () => {
  it("preserves the exact snapshotted estimate regardless of any 'current' catalog price", () => {
    const snapshot = {
      scopes: [
        {
          title: "Living Room",
          laborHours: 24,
          laborSellRate: 75,
          laborSellingPrice: 1800,
          materials: [
            { name: "Regal Paint", unit: "gallon", quantity: 5, unitCost: 40, materialCost: 200, sellingPrice: 280 },
          ],
          materialsCost: 200,
          materialsSellingPrice: 280,
          additionalCharges: 0,
          subtotal: 2080,
        },
        {
          title: "Hallway",
          laborHours: 8,
          laborSellRate: 75,
          laborSellingPrice: 600,
          materials: [],
          materialsCost: 0,
          materialsSellingPrice: 0,
          additionalCharges: 0,
          subtotal: 600,
        },
      ],
      totalAmount: 2680,
    };

    const seed = buildJobEstimateFromProposal(snapshot);

    expect(seed.materialsBudget).toBe(280);
    expect(seed.laborBudget).toBe(2400);
    expect(seed.totalEstimate).toBe(2680);
    expect(seed.materials).toHaveLength(1);
    expect(seed.materials[0].unitCost).toBe(40);
    expect(seed.materials[0].totalCost).toBe(200);
    expect(seed.labor).toHaveLength(2);
    expect(seed.labor[0].totalCost).toBe(1800);
    expect(seed.labor[1].totalCost).toBe(600);

    // Simulate the catalog price changing after acceptance — the snapshot function
    // never re-reads it, so re-running with the same snapshot yields the same result.
    const seedAgain = buildJobEstimateFromProposal(snapshot);
    expect(seedAgain).toEqual(seed);
  });

  it("omits scopes with no estimated labor hours from the labor rows", () => {
    const snapshot = {
      scopes: [
        {
          title: "Materials only",
          laborHours: null,
          laborSellRate: null,
          laborSellingPrice: 0,
          materials: [{ name: "Caulk", unit: "tube", quantity: 3, unitCost: 5, materialCost: 15, sellingPrice: 18 }],
          materialsCost: 15,
          materialsSellingPrice: 18,
          additionalCharges: 0,
          subtotal: 18,
        },
      ],
      totalAmount: 18,
    };

    const seed = buildJobEstimateFromProposal(snapshot);
    expect(seed.labor).toHaveLength(0);
    expect(seed.materials).toHaveLength(1);
  });
});

describe("production-rate calculations", () => {
  it("calculates sqft-per-hour labor from a measurement and production rate", () => {
    expect(calculateProductionHours({ measurement: 620, productionRate: 85, basis: "SQFT_PER_HOUR" })).toBe(7.29);
  });

  it("calculates linear-feet-per-hour labor from a measurement and production rate", () => {
    expect(calculateProductionHours({ measurement: 84, productionRate: 40, basis: "LINEAR_FT_PER_HOUR" })).toBe(2.1);
  });

  it("calculates hours-per-item labor for fixed counts", () => {
    expect(calculateProductionHours({ measurement: 4, productionRate: 1.5, basis: "HOURS_PER_ITEM" })).toBe(6);
  });

  it("supports fixed-hour work items", () => {
    expect(calculateProductionHours({ measurement: 0, productionRate: 0, basis: "FIXED_HOURS", fixedHours: 3.5 })).toBe(3.5);
  });

  it("uses adjusted hours when present while preserving the calculated value", () => {
    expect(calculateProductionHours({ measurement: 620, productionRate: 85, basis: "SQFT_PER_HOUR", adjustedHours: 8.5 })).toBe(8.5);
  });
});

describe("paint material calculations", () => {
  it("calculates gallons before waste for coverage-based paint", () => {
    expect(calculatePaintMaterialQuantity({ measurement: 620, coats: 2, coveragePerUnit: 350 })).toBe(3.54);
  });

  it("includes configured waste percentage", () => {
    const result = calculatePaintMaterialQuantity({ measurement: 620, coats: 2, coveragePerUnit: 350, wastePercent: 10 });
    expect(result).toBe(3.9);
  });

  it("supports adjusted quantity overrides while preserving the calculated quantity", () => {
    const result = calculatePaintMaterialQuantity({ measurement: 620, coats: 2, coveragePerUnit: 350, adjustedQuantity: 4 });
    expect(result).toBe(4);
  });

  it("guards against invalid coverage and zero measurement safety", () => {
    expect(() => calculatePaintMaterialQuantity({ measurement: 0, coats: 2, coveragePerUnit: 350 })).toThrow();
    expect(() => calculatePaintMaterialQuantity({ measurement: 620, coats: 2, coveragePerUnit: 0 })).toThrow();
  });
});

describe("selling price and summary metrics", () => {
  it("calculates markup price for a cost base", () => {
    expect(calculateMarkupPrice({ cost: 7000, markupPercent: 0.3 })).toBe(9100);
  });

  it("calculates gross margin price for a target margin", () => {
    expect(calculateGrossMarginPrice({ cost: 7000, desiredMarginPercent: 30 })).toBe(10000);
  });

  it("calculates the effective sales rate", () => {
    expect(calculateEffectiveSalesRate({ finalProposalPrice: 12500, estimatedPainterHours: 125 })).toBe(100);
  });
});

describe("draft naming helpers", () => {
  it("uses Untitled Proposal when project name is blank", () => {
    expect(normalizeProposalProjectName("")).toBe("Untitled Proposal");
    expect(normalizeProposalProjectName("   ")).toBe("Untitled Proposal");
    expect(normalizeProposalProjectName("Kitchen Remodel")).toBe("Kitchen Remodel");
  });
});

describe("round2", () => {
  it("rounds to two decimal places without floating point drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(19.005)).toBe(19.01);
  });
});

describe("resolveLaborSellRate — no silent business-rate assumption", () => {
  it("returns null when there are no estimated hours", () => {
    expect(resolveLaborSellRate(0, null, null, "Living Room")).toBeNull();
  });

  it("uses the per-scope override when provided", () => {
    expect(resolveLaborSellRate(10, 90, 75, "Living Room")).toBe(90);
  });

  it("falls back to the configured company default when no override is set", () => {
    expect(resolveLaborSellRate(10, null, 80, "Living Room")).toBe(80);
  });

  it("throws MissingLaborRateError when hours > 0 and neither override nor company default is configured", () => {
    expect(() => resolveLaborSellRate(10, null, null, "Living Room")).toThrow(MissingLaborRateError);
    expect(() => resolveLaborSellRate(10, null, null, "Living Room")).toThrow(/no labor sell rate is set/);
  });

  it("never assumes a hardcoded rate such as 75 when nothing is configured", () => {
    let caught: unknown;
    try {
      resolveLaborSellRate(5, null, null, "Kitchen");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MissingLaborRateError);
  });
});
