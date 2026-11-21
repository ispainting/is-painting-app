export type PayrollPreviewInput = {
  regularHours: number;
  specialHours: number;
  travelHours: number;
  overtimeHours: number;
  regularRate: number;
  specialAdjustment: number;
  overtimeMultiplier: number;
  overtimeRate?: number | null;
  travelRateType: "regular" | "special" | "custom";
  customTravelRate?: number | null;
};

export function calculateEmployeeGrossPay(input: PayrollPreviewInput) {
  const regularRate = safeNumber(input.regularRate);
  const specialAdjustment = safeNumber(input.specialAdjustment);
  const customTravelRate = input.customTravelRate == null ? null : safeNumber(input.customTravelRate);

  const specialRate = regularRate + specialAdjustment;
  // Overtime is disabled. Legacy fields remain readable for compatibility only.
  const travelRate =
    input.travelRateType === "special"
      ? specialRate
      : input.travelRateType === "custom"
        ? (customTravelRate ?? regularRate)
        : regularRate;

  const regularPay = safeNumber(input.regularHours) * regularRate;
  const specialPay = safeNumber(input.specialHours) * specialRate;
  const travelPay = safeNumber(input.travelHours) * travelRate;
  const overtimePay = 0;

  return {
    regularRate,
    specialRate,
    travelRate,
    overtimeRate: regularRate,
    regularPay,
    specialPay,
    travelPay,
    overtimePay,
    estimatedGrossPay: regularPay + specialPay + travelPay,
  };
}

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
