"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
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
import { CalendarDays, FileSpreadsheet, FileText, Printer, Sparkles } from "lucide-react";

const PERIOD_LABELS = {
  month: "Monthly Report",
  quarter: "Quarterly Report",
  year: "Annual Report",
  custom: "Custom Report",
} as const;

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

export default function ReportsPage() {
  const now = new Date();
  const [periodType, setPeriodType] = useState<"month" | "quarter" | "year" | "custom">("month");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [startDate, setStartDate] = useState(now.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(now.toISOString().slice(0, 10));

  const query = useMemo(() => {
    const input: any = {
      periodType,
      month,
      quarter,
      year,
      comparePreviousMonth: periodType === "month",
      compareSameMonthLastYear: periodType === "month" || periodType === "year",
      comparePreviousYear: periodType === "year",
      compareCustomPeriods: periodType === "custom",
    };
    if (periodType === "custom") {
      input.startDate = startDate;
      input.endDate = endDate;
    }
    return input;
  }, [periodType, month, quarter, year, startDate, endDate]);

  const { data, isLoading } = api.business.analytics.useQuery(query);
  const reportLabel = data?.period?.label ?? "Selected period";
  const aiReview = data?.aiReview;

  const exportExcel = () => {
    if (!data) return;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Metric: "Revenue", Value: data.dashboard.revenue },
      { Metric: "Expenses", Value: data.dashboard.profit.expenses },
      { Metric: "Payroll", Value: data.dashboard.profit.payroll },
      { Metric: "Estimated Net Profit", Value: data.dashboard.profit.estimatedNetProfit },
      { Metric: "Cash Expected", Value: data.dashboard.cashFlow.cashExpected },
      { Metric: "Open Proposals", Value: data.dashboard.pipeline.openProposals },
      { Metric: "Open Proposal Value", Value: data.dashboard.pipeline.openProposalValue },
    ]), "KPI Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((data.revenue.revenueByMonth ?? []).map((row: any) => ({ Month: row.label, Revenue: row.value }))), "Revenue By Month");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((data.profit.profitByMonth ?? []).map((row: any) => ({ Month: row.label, Profit: row.value }))), "Profit By Month");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((data.proposals.series ?? []).map((row: any) => ({ Month: row.label, Leads: row.leadsReceived, Estimates: row.estimatesCreated, Sent: row.proposalsSent, Won: row.proposalsWon, Lost: row.proposalsLost, RevenueWon: row.revenueWon }))), "Proposal Stats");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((data.leadSources ?? []).map((row: any) => ({ Source: row.source, Leads: row.leads, Estimates: row.estimates, Proposals: row.proposals, Won: row.won, CloseRate: row.closeRate, Revenue: row.revenueGenerated, AvgJobSize: row.averageJobSize, ROI: row.roi }))), "Lead Sources");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((data.customers?.topCustomers ?? []).map((row: any) => ({ Customer: row.name, Revenue: row.revenue, Jobs: row.jobs, Source: row.source }))), "Top Customers");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet((data.employees ?? []).map((row: any) => ({ Employee: row.name, Hours: row.hours, Payroll: row.payroll, Revenue: row.revenue, RevenuePerHour: row.revenuePerEmployee, LaborEfficiency: row.laborEfficiency }))), "Employee Productivity");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Summary: aiReview?.summary ?? "" }, ...((aiReview?.recommendations ?? []).map((recommendation: string) => ({ Summary: recommendation })))]), "AI Review");
    XLSX.writeFile(workbook, `${PERIOD_LABELS[periodType].replace(/\s+/g, "-").toLowerCase()}.xlsx`);
  };

  const printPdf = () => {
    window.print();
  };

  return (
    <>
      <PageHeader title="Reports" description="Professional business reports for banks, investors, accountants, and partners." />

      <div className="space-y-4 print:space-y-0">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Report Builder</div>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{PERIOD_LABELS[periodType]}</h2>
              <p className="mt-2 text-sm text-slate-500">Build a clean report package and export it as PDF or Excel.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={CalendarDays} label="Monthly Report" onClick={() => setPeriodType("month")} active={periodType === "month"} />
              <ActionButton icon={CalendarDays} label="Quarterly Report" onClick={() => setPeriodType("quarter")} active={periodType === "quarter"} />
              <ActionButton icon={CalendarDays} label="Annual Report" onClick={() => setPeriodType("year")} active={periodType === "year"} />
              <ActionButton icon={CalendarDays} label="Custom Report" onClick={() => setPeriodType("custom")} active={periodType === "custom"} />
              <ActionButton icon={Printer} label="Export PDF" onClick={printPdf} />
              <ActionButton icon={FileSpreadsheet} label="Export Excel" onClick={exportExcel} />
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SelectField label="Month" value={String(month)} onChange={(value) => setMonth(Number(value))} options={MONTH_OPTIONS.map((option) => [String(option.value), option.label])} />
            <SelectField label="Quarter" value={String(quarter)} onChange={(value) => setQuarter(Number(value))} options={[["1", "Q1"], ["2", "Q2"], ["3", "Q3"], ["4", "Q4"]]} />
            <SelectField label="Year" value={String(year)} onChange={(value) => setYear(Number(value))} options={buildYearOptions(year).map((value) => [String(value), String(value)])} />
            {periodType === "custom" ? (
              <>
                <DateField label="Start date" value={startDate} onChange={setStartDate} />
                <DateField label="End date" value={endDate} onChange={setEndDate} />
              </>
            ) : null}
          </div>
        </div>

        {isLoading || !data ? (
          <div className="grid gap-4 lg:grid-cols-2 print:hidden">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="space-y-4 print:space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-300">Executive Summary</div>
                  <h2 className="mt-2 text-2xl font-semibold">{reportLabel}</h2>
                  <p className="mt-2 max-w-3xl text-sm text-slate-300">{buildExecutiveSummary(data)}</p>
                </div>
                <div className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
                  {formatCurrency(data.dashboard.profit.estimatedNetProfit)} estimated net profit
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Revenue" value={formatCurrency(data.dashboard.revenue)} />
              <KpiCard label="Expenses" value={formatCurrency(data.dashboard.profit.expenses)} />
              <KpiCard label="Payroll" value={formatCurrency(data.dashboard.profit.payroll)} />
              <KpiCard label="Net Profit" value={formatCurrency(data.dashboard.profit.estimatedNetProfit)} />
              <KpiCard label="Gross Margin" value={formatPercentFromValue(data.profit.grossProfit, data.dashboard.revenue)} />
              <KpiCard label="Profit Margin" value={formatPercentFromValue(data.dashboard.profit.estimatedNetProfit, data.dashboard.revenue)} />
              <KpiCard label="Cash Flow" value={formatCurrency(data.dashboard.cashFlow.cashExpected)} />
              <KpiCard label="Proposal Close Rate" value={formatPercent(data.dashboard.proposalPerformance.closeRate)} />
            </div>

            <SectionBlock title="Cash Flow & Invoices" icon={FileText}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Money collected" value={formatCurrency(data.dashboard.cashFlow.moneyCollected)} />
                <KpiCard label="Outstanding invoices" value={formatCurrency(data.dashboard.cashFlow.outstandingInvoices)} />
                <KpiCard label="Overdue invoices" value={formatCount(data.dashboard.cashFlow.overdueInvoices)} />
                <KpiCard label="Cash expected" value={formatCurrency(data.dashboard.cashFlow.cashExpected)} />
              </div>
            </SectionBlock>

            <SectionBlock title="Operations" icon={Sparkles}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Completed jobs" value={formatCount(data.dashboard.operations.completedJobs)} />
                <KpiCard label="Open jobs" value={formatCount(data.dashboard.operations.openJobs)} />
                <KpiCard label="Active jobs" value={formatCount(data.dashboard.operations.activeJobs)} />
                <KpiCard label="Employee hours" value={formatCount(data.dashboard.operations.employeeHours)} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                <KpiCard label="Jobs starting this week" value={formatCount(data.dashboard.operations.jobsStartingThisWeek)} />
                <KpiCard label="Jobs ending this week" value={formatCount(data.dashboard.operations.jobsEndingThisWeek)} />
                <KpiCard label="Employees working today" value={formatCount(data.dashboard.operations.employeesWorkingToday)} />
              </div>
            </SectionBlock>

            <div className="grid gap-4 xl:grid-cols-2">
              <ReportChartCard title="Revenue by Month">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.revenue.revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => abbreviateCurrency(Number(value))} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                    <Line type="monotone" dataKey="value" stroke="#0f172a" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </ReportChartCard>
              <ReportChartCard title="Profit by Month">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data.profit.profitByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => abbreviateCurrency(Number(value))} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                    <Area type="monotone" dataKey="value" stroke="#166534" fill="#22c55e" fillOpacity={0.22} />
                  </AreaChart>
                </ResponsiveContainer>
              </ReportChartCard>
            </div>

            <SectionBlock title="Proposal Statistics" icon={FileText}>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                <KpiCard label="Leads received" value={formatCount(data.proposals.leadsReceived)} />
                <KpiCard label="Estimates created" value={formatCount(data.proposals.estimatesCreated)} />
                <KpiCard label="Proposals sent" value={formatCount(data.proposals.proposalsSent)} />
                <KpiCard label="Proposals won" value={formatCount(data.proposals.proposalsWon)} />
                <KpiCard label="Proposals lost" value={formatCount(data.proposals.proposalsLost)} />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                <KpiCard label="Close rate" value={formatPercent(data.proposals.closeRate)} />
                <KpiCard label="Average proposal amount" value={formatCurrency(data.proposals.averageProposalAmount)} />
                <KpiCard label="Average job amount" value={formatCurrency(data.proposals.averageJobAmount)} />
                <KpiCard label="Revenue won" value={formatCurrency(data.proposals.revenueWon)} />
                <KpiCard label="Revenue lost" value={formatCurrency(data.proposals.revenueLost)} />
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
                    {data.proposals.series.map((row: any) => (
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
            </SectionBlock>

            <SectionBlock title="Lead Sources" icon={Sparkles}>
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
                    {data.leadSources.map((row: any) => (
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
            </SectionBlock>

            <SectionBlock title="Customer Intelligence" icon={FileText}>
              <div className="grid gap-4 xl:grid-cols-3">
                <ReportTable title="Top customers" headers={["Customer", "Revenue", "Jobs"]} rows={(data.customers.topCustomers ?? []).map((row: any) => [row.name, formatCurrency(row.revenue), formatCount(row.jobs)])} />
                <ReportTable title="Largest jobs" headers={["Job", "Customer", "Value"]} rows={(data.customers.largestJobs ?? []).map((row: any) => [row.name, row.customer, formatCurrency(row.value)])} />
                <ReportTable title="Most profitable jobs" headers={["Job", "Customer", "Profit"]} rows={(data.customers.mostProfitableJobs ?? []).map((row: any) => [row.name, row.customer, formatCurrency(row.profit)])} />
              </div>
              <div className="mt-4 text-sm text-slate-500">Repeat customers: <span className="font-medium text-slate-900">{formatCount(data.customers.repeatCustomers)}</span></div>
            </SectionBlock>

            <SectionBlock title="Employee Productivity" icon={Sparkles}>
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
                    {data.employees.map((row: any) => (
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
            </SectionBlock>

            <SectionBlock title="Seasonality" icon={CalendarDaysIcon}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <KpiCard label="Best month" value={formatSeasonValue(data.seasonal.bestMonth)} />
                <KpiCard label="Worst month" value={formatSeasonValue(data.seasonal.worstMonth)} />
                <KpiCard label="Best quarter" value={formatSeasonValue(data.seasonal.bestQuarter)} />
                <KpiCard label="Slowest quarter" value={formatSeasonValue(data.seasonal.slowestQuarter)} />
                <KpiCard label="Year-over-year growth" value={formatSignedPercent(data.seasonal.yearOverYearGrowth ?? null)} />
              </div>
            </SectionBlock>

            <SectionBlock title="AI Business Review" icon={Sparkles}>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm leading-7 text-slate-700">{aiReview?.summary ?? "No analysis available."}</p>
                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommended actions</div>
                  <ul className="mt-2 space-y-2 text-sm text-slate-700">
                    {(aiReview?.recommendations ?? []).map((recommendation: string) => (
                      <li key={recommendation} className="flex items-start gap-2">
                        <span className="mt-1 h-2 w-2 rounded-full bg-slate-900" />
                        <span>{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </SectionBlock>
          </div>
        )}
      </div>
    </>
  );
}

function buildYearOptions(currentYear: number) {
  return [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];
}

function buildExecutiveSummary(data: any) {
  const revenue = formatCurrency(data.dashboard.revenue);
  const profit = formatCurrency(data.dashboard.profit.estimatedNetProfit);
  const margin = formatPercent(data.dashboard.profit.profitMargin);
  return `The selected period generated ${revenue} in revenue, with ${profit} in estimated net profit and a ${margin} margin. Pipeline, customer mix, and employee productivity are summarized below.`;
}

function SectionBlock({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        <Icon className="h-5 w-5 text-brand-500" />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ReportChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 print:break-inside-avoid">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 print:break-inside-avoid">
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

function ActionButton({ icon: Icon, label, onClick, active = false }: { icon: any; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 print:break-inside-avoid">
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
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
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

function formatPercentFromValue(value: number | null | undefined, base: number) {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || !Number.isFinite(base) || base === 0) return "—";
  return `${((Number(value) / base) * 100).toFixed(1)}%`;
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

function SkeletonCard() {
  return <div className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />;
}

function CalendarDaysIcon(props: any) {
  return <CalendarDays {...props} />;
}
