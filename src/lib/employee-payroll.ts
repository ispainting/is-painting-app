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
  const overtimeMultiplier = safeNumber(input.overtimeMultiplier) || 1.5;
  const explicitOvertimeRate = input.overtimeRate == null ? null : safeNumber(input.overtimeRate);
  const customTravelRate = input.customTravelRate == null ? null : safeNumber(input.customTravelRate);

  const specialRate = regularRate + specialAdjustment;
  const overtimeRate = explicitOvertimeRate != null ? explicitOvertimeRate : specialRate * overtimeMultiplier;
  const travelRate =
    input.travelRateType === "special"
      ? specialRate
      : input.travelRateType === "custom"
        ? (customTravelRate ?? regularRate)
        : regularRate;

  const regularPay = safeNumber(input.regularHours) * regularRate;
  const specialPay = safeNumber(input.specialHours) * specialRate;
  const travelPay = safeNumber(input.travelHours) * travelRate;
  const overtimePay = safeNumber(input.overtimeHours) * overtimeRate;

  return {
    regularRate,
    specialRate,
    travelRate,
    overtimeRate,
    regularPay,
    specialPay,
    travelPay,
    overtimePay,
    estimatedGrossPay: regularPay + specialPay + travelPay + overtimePay,
  };
}

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
