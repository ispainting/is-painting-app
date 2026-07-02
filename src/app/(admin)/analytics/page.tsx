"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency } from "@/lib/utils";
import { BarChart3, Briefcase, CalendarRange, DollarSign, FileText, Sparkles, TrendingUp, Users } from "lucide-react";

const MONTH_OPTIONS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export default function BusinessAnalyticsPage() {
  const now = new Date();
  const [periodType, setPeriodType] = useState<"month" | "quarter" | "year" | "custom">("month");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [startDate, setStartDate] = useState(now.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));
  const [comparePreviousMonth, setComparePreviousMonth] = useState(true);
  const [compareSameMonthLastYear, setCompareSameMonthLastYear] = useState(true);
  const [comparePreviousYear, setComparePreviousYear] = useState(true);
  const [compareCustomPeriods, setCompareCustomPeriods] = useState(true);

  const query = useMemo(() => {
    const input: any = {
      periodType,
      month,
      quarter,
      year,
      comparePreviousMonth,
      compareSameMonthLastYear,
      comparePreviousYear,
      compareCustomPeriods,
    };
    if (periodType === "custom") {
      input.startDate = startDate;
      input.endDate = endDate;
    }
    return input;
  }, [periodType, month, quarter, year, startDate, endDate, comparePreviousMonth, compareSameMonthLastYear, comparePreviousYear, compareCustomPeriods]);

  const { data, isLoading } = api.business.analytics.useQuery(query);
  const comparisons = data?.comparisons;
  const revenueByMonth = data?.revenue?.revenueByMonth ?? [];
  const revenueByYear = data?.revenue?.revenueByYear ?? [];
  const profitByMonth = data?.profit?.profitByMonth ?? [];
  const proposalSeries = data?.proposals?.series ?? [];
  const leadSources = data?.leadSources ?? [];
  const topCustomers = data?.customers?.topCustomers ?? [];
  const employees = data?.employees ?? [];
  const seasonal = (data?.seasonal ?? {}) as any;

  return (
    <>
      <PageHeader title="Business Analytics" description="Trend analysis, source quality, customer performance, and operational efficiency." />

      <div className="space-y-4">
        <SectionCard title="Filters" icon={CalendarRange} subtitle="Change the analysis window and comparison mode.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SelectField label="Period" value={periodType} onChange={(value) => setPeriodType(value as any)} options={[
              ["month", "Month"],
              ["quarter", "Quarter"],
              ["year", "Year"],
              ["custom", "Custom Date Range"],
            ]} />
            <SelectField label="Month" value={String(month)} onChange={(value) => setMonth(Number(value))} options={MONTH_OPTIONS.map((option) => [String(option.value), option.label])} />
            <SelectField label="Quarter" value={String(quarter)} onChange={(value) => setQuarter(Number(value))} options={[["1", "Q1"], ["2", "Q2"], ["3", "Q3"], ["4", "Q4"]]} />
            <SelectField label="Year" value={String(year)} onChange={(value) => setYear(Number(value))} options={buildYearOptions(year).map((value) => [String(value), String(value)])} />
          </div>
          {periodType === "custom" ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <DateField label="Start date" value={startDate} onChange={setStartDate} />
              <DateField label="End date" value={endDate} onChange={setEndDate} />
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ToggleField label="Compare to previous month" checked={comparePreviousMonth} onChange={setComparePreviousMonth} />
            <ToggleField label="Compare to same month last year" checked={compareSameMonthLastYear} onChange={setCompareSameMonthLastYear} />
            <ToggleField label="Compare to previous year" checked={comparePreviousYear} onChange={setComparePreviousYear} />
            <ToggleField label="Compare custom periods" checked={compareCustomPeriods} onChange={setCompareCustomPeriods} />
          </div>
          <div className="mt-4 text-sm text-slate-500">
            Current period: <span className="font-medium text-slate-900">{data?.period?.label ?? "Selected period"}</span>
          </div>
        </SectionCard>

        {comparisons ? (
          <SectionCard title="Comparison Snapshot" icon={TrendingUp} subtitle="Simple differences between the selected period and the comparison window.">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Revenue delta" value={formatSignedCurrency(comparisons.revenueDifference)} />
              <KpiCard label="Profit delta" value={formatSignedCurrency(comparisons.profitDifference)} />
              <KpiCard label="Close rate delta" value={formatSignedPercentPoints(comparisons.closeRateDifference)} />
              <KpiCard label="Proposal value delta" value={formatSignedCurrency(comparisons.proposalValueDifference)} />
            </div>
          </SectionCard>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <SectionCard title="Revenue Analytics" icon={DollarSign} subtitle="Revenue by month and year, plus growth context.">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Revenue by month">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => abbreviateCurrency(Number(value))} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                    <Line type="monotone" dataKey="value" stroke="#0f172a" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Revenue by year">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={revenueByYear}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => abbreviateCurrency(Number(value))} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                    <Bar dataKey="value" fill="#0f172a" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <KpiCard label="Average monthly revenue" value={formatCurrency(data?.revenue?.averageMonthlyRevenue)} />
              <KpiCard label="Revenue growth %" value={formatSignedPercent(data?.revenue?.revenueGrowthPercent)} />
              <KpiCard label="Quarterly revenue" value={formatCurrency(revenueByMonth.reduce((sum: number, row: any) => sum + Number(row.value ?? 0), 0))} />
            </div>
          </SectionCard>

          <SectionCard title="Profit Analytics" icon={BarChart3} subtitle="Profitability over time and the current cost structure.">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Profit by month">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={profitByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => abbreviateCurrency(Number(value))} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                    <Area type="monotone" dataKey="value" stroke="#166534" fill="#22c55e" fillOpacity={0.22} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>
              <div className="space-y-3">
                <KpiCard label="Gross profit" value={formatCurrency(data?.profit?.grossProfit)} />
                <KpiCard label="Net profit" value={formatCurrency(data?.profit?.netProfit)} />
                <KpiCard label="Expenses" value={formatCurrency(data?.profit?.expenses)} />
                <KpiCard label="Payroll" value={formatCurrency(data?.profit?.payroll)} />
                <KpiCard label="Profit margin" value={formatPercent(data?.profit?.profitMargin)} />
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Proposal Analytics" icon={FileText} subtitle="Lead, estimate, proposal, and close-rate performance.">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
            <KpiCard label="Leads received" value={formatCount(data?.proposals?.leadsReceived)} />
            <KpiCard label="Estimates created" value={formatCount(data?.proposals?.estimatesCreated)} />
            <KpiCard label="Proposals sent" value={formatCount(data?.proposals?.proposalsSent)} />
            <KpiCard label="Proposals won" value={formatCount(data?.proposals?.proposalsWon)} />
            <KpiCard label="Proposals lost" value={formatCount(data?.proposals?.proposalsLost)} />
            <KpiCard label="Close rate" value={formatPercent(data?.proposals?.closeRate)} />
            <KpiCard label="Average proposal amount" value={formatCurrency(data?.proposals?.averageProposalAmount)} />
            <KpiCard label="Average job amount" value={formatCurrency(data?.proposals?.averageJobAmount)} />
            <KpiCard label="Revenue won" value={formatCurrency(data?.proposals?.revenueWon)} />
            <KpiCard label="Revenue lost" value={formatCurrency(data?.proposals?.revenueLost)} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Month</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Leads</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Sent</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Won</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Lost</th>
                  <th className="border-b border-slate-200 pb-2 font-semibold">Revenue won</th>
                </tr>
              </thead>
              <tbody>
                {proposalSeries.map((row: any) => (
                  <tr key={row.key}>
                    <td className="border-b border-slate-100 py-3 pr-4 font-medium text-slate-900">{row.label}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.leadsReceived)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.proposalsSent)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.proposalsWon)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.proposalsLost)}</td>
                    <td className="border-b border-slate-100 py-3 text-slate-700">{formatCurrency(row.revenueWon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Lead Source Analytics" icon={Sparkles} subtitle="What marketing source actually makes money.">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Source</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Leads</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Estimates</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Proposals</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Won</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Close rate</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Revenue</th>
                  <th className="border-b border-slate-200 pb-2 font-semibold">Average job size</th>
                </tr>
              </thead>
              <tbody>
                {leadSources.map((row: any) => (
                  <tr key={row.source}>
                    <td className="border-b border-slate-100 py-3 pr-4 font-medium text-slate-900">{row.source}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.leads)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.estimates)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.proposals)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.won)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatPercent(row.closeRate)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCurrency(row.revenueGenerated)}</td>
                    <td className="border-b border-slate-100 py-3 text-slate-700">{formatCurrency(row.averageJobSize)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <ExpandableSection title="Customer Analytics" icon={Users} summary="Top customers, repeat customers, largest jobs, and most profitable jobs.">
          <div className="grid gap-4 xl:grid-cols-3">
            <ReportTable title="Top customers" headers={["Customer", "Revenue", "Jobs"]} rows={topCustomers.map((row: any) => [row.name, formatCurrency(row.revenue), formatCount(row.jobs)])} />
            <ReportTable title="Largest jobs" headers={["Job", "Customer", "Value"]} rows={(data?.customers?.largestJobs ?? []).map((row: any) => [row.name, row.customer, formatCurrency(row.value)])} />
            <ReportTable title="Most profitable jobs" headers={["Job", "Customer", "Profit"]} rows={(data?.customers?.mostProfitableJobs ?? []).map((row: any) => [row.name, row.customer, formatCurrency(row.profit)])} />
          </div>
          <div className="mt-4 text-sm text-slate-500">Repeat customers: <span className="font-medium text-slate-900">{formatCount(data?.customers?.repeatCustomers)}</span></div>
        </ExpandableSection>

        <ExpandableSection title="Employee Analytics" icon={Briefcase} summary="Hours worked, payroll cost, revenue generated, and labor efficiency.">
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Employee</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Hours</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Payroll</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Revenue</th>
                  <th className="border-b border-slate-200 pb-2 pr-4 font-semibold">Revenue / Hour</th>
                  <th className="border-b border-slate-200 pb-2 font-semibold">Labor efficiency</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((row: any) => (
                  <tr key={row.name}>
                    <td className="border-b border-slate-100 py-3 pr-4 font-medium text-slate-900">{row.name}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCount(row.hours)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCurrency(row.payroll)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCurrency(row.revenue)}</td>
                    <td className="border-b border-slate-100 py-3 pr-4 text-slate-700">{formatCurrency(row.revenuePerEmployee)}</td>
                    <td className="border-b border-slate-100 py-3 text-slate-700">{formatPercent(row.laborEfficiency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ExpandableSection>

        <SectionCard title="Seasonal Trends" icon={CalendarRange} subtitle="Best month, best quarter, and year-over-year growth.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="Best month" value={formatSeasonValue(seasonal.bestMonth)} />
            <KpiCard label="Worst month" value={formatSeasonValue(seasonal.worstMonth)} />
            <KpiCard label="Best quarter" value={formatSeasonValue(seasonal.bestQuarter)} />
            <KpiCard label="Slowest quarter" value={formatSeasonValue(seasonal.slowestQuarter)} />
            <KpiCard label="Year-over-year growth" value={formatSignedPercent(seasonal.yearOverYearGrowth ?? null)} />
          </div>
        </SectionCard>
      </div>
    </>
  );
}

function buildYearOptions(currentYear: number) {
  return [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</div>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Icon className="h-8 w-8 text-brand-500" />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
      <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="font-medium text-slate-900">{label}</span>
    </label>
  );
}

function ExpandableSection({ title, summary, icon: Icon, children }: { title: string; summary: string; icon: any; children: React.ReactNode }) {
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" open>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</div>
          <p className="mt-1 text-sm text-slate-500">{summary}</p>
        </div>
        <Icon className="h-8 w-8 text-brand-500" />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              {headers.map((header) => (
                <th key={header} className="border-b border-slate-200 pb-2 pr-4 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-slate-500" colSpan={headers.length}>No data available.</td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {row.map((value, cellIndex) => (
                    <td key={`${title}-${index}-${cellIndex}`} className="border-b border-slate-100 py-3 pr-4 text-slate-700">{value}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString("en-US");
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatSignedPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const percent = Number(value) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

function formatSignedPercentPoints(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const percent = Number(value) * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)} pp`;
}

function formatSignedCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${value >= 0 ? "+" : ""}${formatCurrency(Math.abs(Number(value)))}`;
}

function formatSeasonValue(item: any) {
  if (!item) return "—";
  return item.label ?? "—";
}

function abbreviateCurrency(value: number) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return `${value}`;
}
