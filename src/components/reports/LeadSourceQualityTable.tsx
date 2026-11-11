"use client";

import { formatCurrency } from "@/lib/utils";
import type { LeadSourceQualityRow } from "@/lib/lead-source-quality";

type LegacyLeadSourceQualityRowView = {
  source: string;
  totalLeads: number;
  invalidDuplicate: number;
  spamFraud: number;
  validLeads: number;
  notQualified: number;
  qualifiedLeads: number;
  qualificationRate: number | null;
  proposalsSent: number;
  proposalRate: number | null;
  won: number;
  closeRate: number | null;
  openOpportunities: number;
  lostCancelled: number;
  quotedValue: number;
  wonJobValue: number;
  avgWonJobValue: number | null;
  cashCollected: number;
};
type LeadSourceQualityRowView = LegacyLeadSourceQualityRowView & Partial<LeadSourceQualityRow>;

function pct(value: number | null) {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function count(value: number) {
  return Number.isFinite(value) ? String(value) : "0";
}

const HEADERS = [
  "Source",
  "Leads",
  "Invalid/Dup",
  "Spam/Fraud",
  "Valid",
  "Not Qualified",
  "Qualified",
  "Qualif. rate",
  "Proposals sent",
  "Proposal rate",
  "Won",
  "Close rate",
  "Open",
  "Lost/Cancelled",
  "Quoted value",
  "Won job value",
  "Avg won job",
  "Cash collected",
  "On Hold",
  "Completed",
  "Archived",
  "Initial estimated value",
  "Pipeline expected value",
  "Lost value",
  "Follow-ups overdue",
  "Avg days to proposal",
  "Avg days to Won/Lost",
  "Avg days to Won",
  "Avg days to Lost",
] as const;

function RowCells({ row, bold }: { row: LeadSourceQualityRowView; bold?: boolean }) {
  const cell = bold ? "border-b border-slate-100 py-2 pr-4 font-semibold text-slate-900" : "border-b border-slate-100 py-2 pr-4 text-slate-700";
  return (
    <>
      <td className={bold ? cell : "border-b border-slate-100 py-2 pr-4 font-medium text-slate-900"}>{row.source}</td>
      <td className={cell}>{count(row.totalLeads)}</td>
      <td className={cell}>{count(row.invalidDuplicate)}</td>
      <td className={cell}>{count(row.spamFraud)}</td>
      <td className={cell}>{count(row.validLeads)}</td>
      <td className={cell}>{count(row.notQualified)}</td>
      <td className={cell}>{count(row.qualifiedLeads)}</td>
      <td className={cell}>{pct(row.qualificationRate)}</td>
      <td className={cell}>{count(row.proposalsSent)}</td>
      <td className={cell}>{pct(row.proposalRate)}</td>
      <td className={cell}>{count(row.won)}</td>
      <td className={cell}>{pct(row.closeRate)}</td>
      <td className={cell}>{count(row.openOpportunities)}</td>
      <td className={cell}>{count(row.lostCancelled)}</td>
      <td className={cell}>{formatCurrency(row.quotedValue)}</td>
      <td className={cell}>{formatCurrency(row.wonJobValue)}</td>
      <td className={cell}>{row.avgWonJobValue == null ? "—" : formatCurrency(row.avgWonJobValue)}</td>
      <td className={cell}>{formatCurrency(row.cashCollected)}</td>
      <td className={cell}>{row.onHold ?? 0}</td>
      <td className={cell}>{row.completed ?? 0}</td>
      <td className={cell}>{row.archived ?? 0}</td>
      <td className={cell}>{formatCurrency(row.initialEstimatedValue ?? 0)}</td>
      <td className={cell}>{formatCurrency(row.pipelineExpectedValue ?? 0)}</td>
      <td className={cell}>{formatCurrency(row.lostValue ?? 0)}</td>
      <td className={cell}>{row.followUpsOverdue ?? 0}</td>
      <td className={cell}>{row.avgDaysToProposal?.toFixed(1) ?? "—"}</td>
      <td className={cell}>{row.avgDaysToOutcome?.toFixed(1) ?? "—"}</td>
      <td className={cell}>{row.avgDaysToWon?.toFixed(1) ?? "—"}</td>
      <td className={cell}>{row.avgDaysToLost?.toFixed(1) ?? "—"}</td>
    </>
  );
}

export function LeadSourceQualityTable({ data }: { data: { rows: LeadSourceQualityRowView[]; totals: LeadSourceQualityRowView } | null | undefined }) {
  if (!data) return null;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            {HEADERS.map((header) => (
              <th key={header} className="border-b border-slate-200 pb-2 pr-4 font-semibold whitespace-nowrap">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.length === 0 ? (
            <tr><td colSpan={HEADERS.length} className="py-6 text-slate-500">No leads in this timeframe.</td></tr>
          ) : (
            data.rows.map((row) => <tr key={row.source}><RowCells row={row} /></tr>)
          )}
          {data.rows.length > 0 && (
            <tr><RowCells row={data.totals} bold /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
