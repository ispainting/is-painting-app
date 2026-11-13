import { formatCurrency } from "@/lib/utils";

export function BudgetActualBar({
  label,
  actual,
  budget,
  budgetPending = false,
}: {
  label: string;
  actual: number;
  budget: number;
  budgetPending?: boolean;
}) {
  const percent = budget > 0 ? (actual / budget) * 100 : actual > 0 ? 100 : 0;
  const overBy = Math.max(0, actual - budget);
  let color = "bg-emerald-500";
  let textColor = "text-emerald-700";
  let status = "On track";

  if (budgetPending) {
    color = actual > 0 ? "bg-slate-400" : "bg-slate-300";
    textColor = "text-slate-600";
    status = "Budget pending";
  } else if (budget <= 0) {
    color = actual > 0 ? "bg-red-600" : "bg-slate-300";
    textColor = actual > 0 ? "text-red-700" : "text-slate-500";
    status = actual > 0 ? "No budget set" : "No budget or spending";
  } else if (percent >= 100) {
    color = "bg-red-600";
    textColor = "text-red-700";
    status = percent > 100 ? `Over by ${formatCurrency(overBy)}` : "At budget limit";
  } else if (percent >= 90) {
    color = "bg-orange-500";
    textColor = "text-orange-700";
    status = "Very close to budget";
  } else if (percent >= 75) {
    color = "bg-amber-400";
    textColor = "text-amber-700";
    status = "Approaching budget";
  }

  const accessibleMax = budget > 0 ? budget : Math.max(actual, 1);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="text-slate-600">{formatCurrency(actual)} / {budgetPending ? "Pending budget" : formatCurrency(budget)}</span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200"
        role="progressbar"
        aria-label={`${label} budget used`}
        aria-valuemin={0}
        aria-valuemax={accessibleMax}
        aria-valuenow={Math.min(actual, accessibleMax)}
      >
        <div className={`h-full rounded-full transition-[width] duration-500 ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <div className="mt-1 flex justify-between gap-3 text-xs">
        <span className={textColor}>{status}</span>
        {!budgetPending && budget > 0 ? <span className="text-slate-500">{percent.toFixed(0)}% used</span> : null}
      </div>
    </div>
  );
}

