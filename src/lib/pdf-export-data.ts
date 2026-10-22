import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";
import type { PayrollEntry } from "./payroll-preview";
import { buildPayrollSummaries } from "./payroll-preview";
import { jobCompletionReportingDate } from "./job-completion";
import { jobCanonicalTotal } from "./job-total";
import { opportunityLeadDate, opportunityValues } from "./opportunity-values";
import { opportunityStageLabel } from "./pipeline-sync";
import { normalizeLeadSourceForReport } from "./lead-source";
import { pdfCurrency as money, pdfDate as date, pdfNumber as number, type PdfExportDocument, type PdfTable } from "./pdf-export";

type Outputs = inferRouterOutputs<AppRouter>;
type Context = { filters: Array<[string, string]>; dateRange?: string; generatedAt?: Date };
const base = (title: string, recordCount: number, context: Context): PdfExportDocument => ({
  title, recordCount, generatedAt: context.generatedAt ?? new Date(),
  dateRange: context.dateRange ?? "All dates (no date filter on this page)",
  filters: context.filters, summary: [], tables: [],
});
const address = (row: { address?: string | null; city?: string | null; state?: string | null; zipCode?: string | null }) =>
  [row.address, row.city, row.state, row.zipCode].filter(Boolean).join(", ");
const sum = <T,>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);

export function payrollPdf(
  entries: PayrollEntry[], summaries: ReturnType<typeof buildPayrollSummaries>, context: Context
): PdfExportDocument {
  const result = base("Time Entries and Payroll", entries.length, context);
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  result.summary = [
    ["Employees", number(summaries.length)],
    ["Total paid hours (including allocated travel)", number(sum(summaries, row => row.totalHours))],
    ["Estimated payroll", money(sum(summaries, row => row.estimatedCheck))],
  ];
  result.tables = [{
    title: "Payroll by employee",
    columns: ["Employee", "Regular hours", "Island / special hours", "Overtime hours", "Travel hours", "Total paid hours", "Base hourly rate", "Estimated pay"],
    rows: summaries.map(row => [row.name, number(row.regularHours), number(row.specialHours), number(row.overtimeHours), number(row.travelHours), number(row.totalHours), money(row.hourlyRate), money(row.estimatedCheck)]),
  }];
  for (const summary of summaries) result.tables.push({
    title: `Time entries: ${summary.name}`,
    columns: ["Date / Job", "Clock In", "Clock Out", "Gross hours", "Break details", "Paid / travel hours", "Rate", "Estimated pay"],
    rows: summary.details.map(detail => {
      const entry = byId.get(detail.id);
      if (!entry) throw new Error("Payroll export is missing a source time entry.");
      return [
        `${date(entry.clockIn)}\n${detail.project}`, date(entry.clockIn, true), date(entry.clockOut, true),
        entry.grossHours == null ? "Not recorded" : number(entry.grossHours),
        `Recorded: ${number(entry.breakDurationMinutes ?? entry.breakMinutes)} min\nDeducted: ${entry.breakDeductionMinutes == null ? "Not recorded" : `${number(entry.breakDeductionMinutes)} min`}\nStart: ${date(entry.breakStartedAt, true)}\nEnd: ${date(entry.breakEndedAt, true)}`,
        `${number(detail.hours)} work\n${number(detail.travelHours)} travel`,
        `${detail.rateLabel}\nTravel: ${detail.travelLabel}`, money(detail.dailyTotal),
      ];
    }),
  });
  result.definitions = [
    "Estimated payroll uses the same Payroll Preview calculation and stored paid hours: weekly overtime, special/island adjustments, and travel allocated once per employee/job/day. This is not a final payroll statement.",
    "Scope: the same loaded time entries as the page (up to 1,000). No additional or hidden time entries are included.",
  ];
  return result;
}

type JobRow = Pick<Outputs["jobs"]["list"][number],
  "name" | "status" | "jobType" | "address" | "city" | "state" | "zipCode" | "contractAmount" | "totalEstimate" |
  "workStartedAt" | "completedAt" | "endDate" | "completionSource" | "deletedAt" | "invoices" | "payments"
> & { customer: { name: string } };
export function jobsPdf(rows: JobRow[], context: Context): PdfExportDocument {
  const result = base("Jobs", rows.length, context);
  const values = rows.map(row => {
    const contract = jobCanonicalTotal(row);
    const invoiced = sum(row.invoices.filter(i => i.status !== "cancelled"), i => Number(i.total));
    const paid = sum(row.payments.filter(p => p.status !== "bounced"), p => Number(p.amount));
    return { contract, invoiced, paid, balance: Math.max(contract, invoiced) - paid };
  });
  result.summary = [["Contract value", money(sum(values, v => v.contract))], ["Invoiced", money(sum(values, v => v.invoiced))], ["Paid", money(sum(values, v => v.paid))], ["Balance", money(sum(values, v => v.balance))]];
  result.tables = [
    { title: "Jobs and lifecycle", columns: ["Customer", "Job / Address", "Status / Type", "Work started", "Completion date", "Completion source", "Visibility"], rows: rows.map(row => [
      row.customer.name, `${row.name}\n${address(row)}`, `${row.status}\n${row.jobType}`, date(row.workStartedAt),
      row.status === "completed" ? date(jobCompletionReportingDate(row)) : "Not completed",
      row.status !== "completed" ? "Not completed" : row.completionSource === "payment" ? "Final Payment" : row.completionSource === "manual" ? "Manual" : row.completedAt ? "Source not recorded" : row.endDate ? "Legacy End Date" : "Completion date missing",
      row.deletedAt ? "Archived" : "Active",
    ]) },
    { title: "Job accounting", columns: ["Customer", "Job", "Contract", "Invoiced", "Paid", "Balance"], rows: rows.map((row, index) => [
      row.customer.name, row.name, money(values[index].contract), money(values[index].invoiced), money(values[index].paid), money(values[index].balance),
    ]) },
  ];
  const missing = rows.filter(row => row.status === "completed" && !jobCompletionReportingDate(row));
  result.summary.push(["Completion date missing", number(missing.length)], ["Completion date missing value", money(sum(missing, jobCanonicalTotal))]);
  result.definitions = [
    "Contract uses the canonical contract amount, or estimate when no positive contract exists. Balance = max(contract, non-cancelled invoice totals) minus non-bounced payments. Negative balance indicates overpayment.",
    "Completion date = completedAt, otherwise legacy endDate. Creation and last-edit dates are never completion dates. Missing dates are not assigned to a month.",
    "Scope: the same loaded Jobs as the current page (up to 200), including archive/status selection.",
  ];
  return result;
}

type OpportunityRow = Pick<Outputs["opportunities"]["list"][number],
  "name" | "serviceType" | "source" | "stage" | "status" | "archivedAt" | "leadReceivedAt" | "createdAt" |
  "followUpAt" | "outcomeAt" | "outcomeReason" | "leadValue" | "lostValue" | "proposals" | "job"
> & { customer: { name: string; leadSource?: string | null; source?: string | null } };
export function opportunitiesPdf(rows: OpportunityRow[], context: Context): PdfExportDocument {
  const result = base("Opportunities", rows.length, context);
  const values = rows.map(opportunityValues);
  result.summary = [
    ["Initial estimated value", money(sum(values, v => v.initial))], ["Expected value", money(sum(values, v => v.expected))],
    ["Contract value", money(sum(values, v => v.contract))], ["Won value", money(sum(values, v => v.won))], ["Lost value", money(sum(values, v => v.lost))],
  ];
  result.tables = [
    { title: "Opportunity pipeline", columns: ["Customer", "Opportunity", "Service", "Lead source", "Stage / Visibility", "Lead received", "Follow-up", "Outcome / Reason"], rows: rows.map(row => [
      row.customer.name, row.name, row.serviceType || "Not recorded", normalizeLeadSourceForReport(row.source ?? row.customer.leadSource ?? row.customer.source),
      `${opportunityStageLabel(row.stage)}\n${row.archivedAt ? "Archived" : "Active"}`, date(opportunityLeadDate(row)), date(row.followUpAt), `${date(row.outcomeAt)}\n${row.outcomeReason || ""}`,
    ]) },
    { title: "Opportunity values", columns: ["Customer", "Opportunity", "Initial estimate", "Expected", "Contract", "Won", "Lost"], rows: rows.map((row, index) => {
      const v = values[index];
      return [row.customer.name, row.name, money(v.initial), money(v.expected), money(v.contract), money(v.won), money(v.lost)];
    }) },
  ];
  result.definitions = [
    "Values use the application's stage-aware opportunityValues helper. Expected uses the latest active Proposal or initial estimate for open records; Contract uses the linked Job; Won applies to completed/won outcomes; Lost uses the preserved loss value.",
    "Rows are the shared filtered Kanban/Table records. Visibility, search, source, service, stage, lead dates and follow-up filters combine with AND logic.",
  ];
  return result;
}

type CustomerRow = Pick<Outputs["customers"]["list"][number],
  "name" | "contactName" | "email" | "phone" | "address" | "city" | "state" | "zipCode" | "leadSource" | "source" |
  "status" | "metrics"
> & { openStage: string | null };
export function customersPdf(rows: CustomerRow[], context: Context): PdfExportDocument {
  const result = base("Customers", rows.length, context);
  result.summary = [["Lifetime value (collected)", money(sum(rows, row => row.metrics.lifetimeValue))], ["Open balance", money(sum(rows, row => row.metrics.openBalance))]];
  result.tables = [{
    title: "Customer directory and relationship summary",
    columns: ["Name / Company", "Contact", "Address", "Lead source", "Status", "Related records", "Value / Balance"],
    rows: rows.map(row => [row.name, [row.contactName, row.email, row.phone].filter(Boolean).join("\n"), address(row),
      normalizeLeadSourceForReport(row.leadSource || row.source), row.status || "Not recorded",
      `${row.metrics.opportunityCount} Opportunities\n${row.metrics.proposalCount} Proposals\n${row.metrics.jobCount} Jobs (${row.metrics.activeJobs} active)\nOpen stage: ${row.openStage ? opportunityStageLabel(row.openStage) : "None"}`,
      `Lifetime: ${money(row.metrics.lifetimeValue)}\nOpen: ${money(row.metrics.openBalance)}`,
    ]),
  }];
  result.definitions = ["Scope: current filtered customer results (up to 500), excluding deleted customers. Value totals use the existing customer list metrics. Contact phone numbers are customer contact information, not employee login numbers."];
  return result;
}

type EmployeeRow = Pick<Outputs["employees"]["list"]["rows"][number], "id" | "name" | "isActive" | "role" | "employeeRole" | "hourlyRate">;
export function employeesPdf(rows: EmployeeRow[], summaries: ReturnType<typeof buildPayrollSummaries>, context: Context): PdfExportDocument {
  const result = base("Employees", rows.length, context);
  result.tables = [{
    title: "Employees and period payroll",
    columns: ["Employee", "Status", "Role / Position", "Hourly rate", "Regular hours", "Island / special hours", "Paid hours", "Estimated payroll"],
    rows: rows.map(row => {
      const summary = summaries.find(s => s.id === row.id);
      return [row.name, row.isActive ? "Active" : "Inactive", `${row.role}\n${row.employeeRole || ""}`, money(row.hourlyRate),
        number(summary?.regularHours), number(summary?.specialHours), number(summary?.totalHours), money(summary?.estimatedCheck)];
    }),
  }];
  const visible = summaries.filter(s => rows.some(row => row.id === s.id));
  result.summary = [["Total paid hours", number(sum(visible, s => s.totalHours))], ["Estimated payroll", money(sum(visible, s => s.estimatedCheck))]];
  result.definitions = [
    "Scope: employees on the currently visible page, not checked selections or hidden pages. Hourly rates/payroll are available only through existing admin-authorized queries.",
    "Period payroll uses the shared Payroll Preview calculation and loaded period entries (up to 1,000 per employee). Paid hours include allocated travel; island hours are included in special hours.",
  ];
  return result;
}

type InventoryRow = Pick<Outputs["inventory"]["list"][number], "name" | "category" | "currentStock" | "unit" | "costPerUnit" | "supplier" | "minStockLevel" | "jobMaterials">;
export function inventoryPdf(rows: InventoryRow[], context: Context): PdfExportDocument {
  const result = base("Inventory Material Catalog", rows.length, context);
  result.summary = [["Stock value", money(sum(rows, row => Number(row.currentStock) * Number(row.costPerUnit)))]];
  result.tables = [{
    title: "Active material catalog",
    columns: ["Product / Material", "Category", "Quantity", "Unit", "Unit cost", "Total value", "Supplier", "Availability"],
    rows: rows.map(row => [row.name, row.category, number(row.currentStock), row.unit, money(row.costPerUnit),
      money(Number(row.currentStock) * Number(row.costPerUnit)), row.supplier || "Not recorded",
      Number(row.currentStock) <= 0 ? "Out of stock" : Number(row.currentStock) <= Number(row.minStockLevel) ? "Low stock" : "In stock",
    ]),
  }];
  result.tables.push({
    title: "Related Jobs (non-archived, authorized Jobs only)",
    columns: ["Product / Material", "Related Jobs"],
    rows: rows.map(row => [row.name, Array.from(new Set(row.jobMaterials.map(material => material.job.name))).join("\n") || "None linked"]),
  });
  result.definitions = ["Only the active materials currently shown are exported. Quantities retain their individual units; unlike units are not summed. Related Jobs come from linked Job materials, excluding archived or unauthorized Jobs."];
  return result;
}

type Analytics = Outputs["business"]["analytics"];
export function reportsPdf(data: Analytics, context: Context): PdfExportDocument {
  const result = base(`Business Report - ${data.period.label}`, 0, { ...context, dateRange: data.period.label });
  const metricTable = (title: string, metrics: Array<[string, string]>): PdfTable => ({ title, columns: ["Metric", "Value"], rows: metrics });
  result.summary = [
    ["Cash revenue", money(data.dashboard.revenue)], ["Expenses", money(data.dashboard.profit.expenses)], ["Payroll", money(data.dashboard.profit.payroll)],
    ["Estimated net profit", money(data.dashboard.profit.estimatedNetProfit)], ["Completed jobs (selected period)", number(data.dashboard.operations.completedJobs)],
    ["Completed jobs (all time)", number(data.jobCompletions.totalCompletedJobs)], ["Completed value (all time)", money(data.jobCompletions.totalCompletedValue)],
    ["Completion date missing (all time)", number(data.jobCompletions.completionDateMissingCount)],
    ["Completion date missing value (all time)", money(data.jobCompletions.completionDateMissingValue)],
  ];
  result.tables = [
    metricTable("Operations, cash and pipeline", [
      ["Active Jobs", number(data.dashboard.operations.activeJobs)], ["Open Jobs", number(data.dashboard.operations.openJobs)],
      ["Employee hours", number(data.dashboard.operations.employeeHours)],
      ["Average Job duration (days)", data.dashboard.operations.averageJobDurationDays == null ? "Not available" : number(data.dashboard.operations.averageJobDurationDays)],
      ["Average lead to completion (days)", data.dashboard.operations.averageLeadToCompletionDays == null ? "Not available" : number(data.dashboard.operations.averageLeadToCompletionDays)],
      ["Open proposal value", money(data.dashboard.pipeline.openProposalValue)], ["Expected revenue", money(data.dashboard.pipeline.expectedRevenue)],
      ["Outstanding invoices", money(data.dashboard.cashFlow.outstandingInvoices)], ["Overdue invoices", number(data.dashboard.cashFlow.overdueInvoices)],
      ["Cash expected", money(data.dashboard.cashFlow.cashExpected)],
      ["Jobs starting this week", number(data.dashboard.operations.jobsStartingThisWeek)],
      ["Jobs ending this week", number(data.dashboard.operations.jobsEndingThisWeek)],
      ["Employees working today", number(data.dashboard.operations.employeesWorkingToday)],
    ]),
    metricTable("Proposal totals (selected period)", [
      ["Leads received", number(data.proposals.leadsReceived)], ["Estimates created", number(data.proposals.estimatesCreated)],
      ["Proposals sent", number(data.proposals.proposalsSent)], ["Proposals won", number(data.proposals.proposalsWon)],
      ["Proposals lost", number(data.proposals.proposalsLost)],
      ["Close rate", data.proposals.closeRate == null ? "N/A" : `${number(data.proposals.closeRate * 100)}%`],
      ["Average Proposal amount", money(data.proposals.averageProposalAmount)], ["Average Job amount", money(data.proposals.averageJobAmount)],
      ["Won revenue", money(data.proposals.revenueWon)], ["Lost revenue", money(data.proposals.revenueLost)],
    ]),
    { title: "Revenue by month (displayed trailing window)", columns: ["Month", "Cash revenue"], rows: data.revenue.revenueByMonth.map(row => [row.label, money(row.value)]) },
    { title: "Profit by month (displayed estimate)", columns: ["Month", "Estimated profit"], rows: data.profit.profitByMonth.map(row => [row.label, money(row.value)]) },
    { title: "Job completions (displayed trailing window)", columns: ["Month", "Completed Jobs", "Completed value"], rows: data.jobCompletions.series.map(row => [row.label, number(row.completedJobs), money(row.completedValue)]) },
    { title: "Proposal statistics (displayed trailing window)", columns: ["Month", "Leads", "Estimates", "Sent", "Won", "Lost", "Won revenue"], rows: data.proposals.series.map(row => [row.label, number(row.leadsReceived), number(row.estimatesCreated), number(row.proposalsSent), number(row.proposalsWon), number(row.proposalsLost), money(row.revenueWon)]) },
    { title: "Lead sources", columns: ["Source", "Leads", "Estimates", "Proposals", "Won", "Close rate", "Revenue", "Avg Job size"], rows: data.leadSources.map(row => [row.source, number(row.leads), number(row.estimates), number(row.proposals), number(row.won), row.closeRate == null ? "N/A" : `${number(row.closeRate * 100)}%`, money(row.revenueGenerated), money(row.averageJobSize)]) },
    { title: "Top customers", columns: ["Customer", "Revenue", "Jobs", "Source"], rows: data.customers.topCustomers.map(row => [row.name, money(row.revenue), number(row.jobs), row.source || "Unknown"]) },
    { title: "Largest Jobs", columns: ["Job", "Customer", "Value"], rows: data.customers.largestJobs.map((row: { name: string; customer: string; value: number }) => [row.name, row.customer, money(row.value)]) },
    { title: "Most profitable Jobs", columns: ["Job", "Customer", "Profit"], rows: data.customers.mostProfitableJobs.map(row => [row.name, row.customer, money(row.profit)]) },
    metricTable("Customer totals", [["Repeat customers", number(data.customers.repeatCustomers)]]),
    { title: "Employee productivity", columns: ["Employee", "Hours", "Payroll", "Revenue", "Revenue per hour", "Labor efficiency"], rows: data.employees.map(row => [row.name, number(row.hours), money(row.payroll), money(row.revenue), money(row.revenuePerEmployee), number(row.laborEfficiency)]) },
    metricTable("AI review", [["Summary", data.aiReview.summary], ...data.aiReview.recommendations.map((text): [string, string] => ["Recommendation", text])]),
  ];
  const seasonalValue = (row: { label: string; value: number }) => `${row.label}: ${money(row.value)}`;
  result.tables.push(metricTable("Seasonality", [
    ["Best month", seasonalValue(data.seasonal.bestMonth)], ["Worst month", seasonalValue(data.seasonal.worstMonth)],
    ["Best quarter", seasonalValue(data.seasonal.bestQuarter)], ["Slowest quarter", seasonalValue(data.seasonal.slowestQuarter)],
    ["Year-over-year growth", data.seasonal.yearOverYearGrowth == null ? "N/A" : `${number(data.seasonal.yearOverYearGrowth * 100)}%`],
  ]));
  const quality = data.leadSourceQuality;
  const qualityRows = quality.rows.length ? [...quality.rows, { ...quality.totals, source: "Total" }] : [];
  const percent = (value: number | null) => value == null ? "N/A" : `${number(value * 100)}%`;
  const days = (value: number | null) => value == null ? "N/A" : number(value);
  result.tables.push({
    title: "Lead Source Quality - Qualification",
    columns: ["Source", "Leads", "Invalid/Dup", "Spam/Fraud", "Valid", "Not qualified", "Qualified", "Qualification rate"],
    rows: qualityRows.map(row => [row.source, number(row.totalLeads), number(row.invalidDuplicate), number(row.spamFraud), number(row.validLeads), number(row.notQualified), number(row.qualifiedLeads), percent(row.qualificationRate)]),
  }, {
    title: "Lead Source Quality - Conversion",
    columns: ["Source", "Proposals sent", "Proposal rate", "Won", "Close rate", "Open", "Lost/Cancelled"],
    rows: qualityRows.map(row => [row.source, number(row.proposalsSent), percent(row.proposalRate), number(row.won), percent(row.closeRate), number(row.openOpportunities), number(row.lostCancelled)]),
  }, {
    title: "Lead Source Quality - Values",
    columns: ["Source", "Quoted value", "Won Job value", "Avg won Job", "Cash collected", "Initial estimate", "Pipeline expected", "Lost value"],
    rows: qualityRows.map(row => [row.source, money(row.quotedValue), money(row.wonJobValue), row.avgWonJobValue == null ? "N/A" : money(row.avgWonJobValue), money(row.cashCollected), money(row.initialEstimatedValue), money(row.pipelineExpectedValue), money(row.lostValue)]),
  }, {
    title: "Lead Source Quality - State and timing",
    columns: ["Source", "On Hold / Completed / Archived", "Follow-ups overdue", "Avg days to Proposal", "Avg days to Won/Lost", "Avg days to Won", "Avg days to Lost"],
    rows: qualityRows.map(row => [row.source, `${number(row.onHold)} / ${number(row.completed)} / ${number(row.archived)}`, number(row.followUpsOverdue), days(row.avgDaysToProposal), days(row.avgDaysToOutcome), days(row.avgDaysToWon), days(row.avgDaysToLost)]),
  });
  result.recordCount = result.tables.reduce((count, table) => count + table.rows.length, 0);
  result.definitions = [
    "Record count is the number of exported report table rows, not unique business records. Tables use the same analytics response as the selected on-screen report, including its explicitly labeled trailing-window charts and all-time completion totals.",
    "Completion date = completedAt ?? endDate, never createdAt/updatedAt. Missing dates remain in all-time totals and in the separate missing-date count/value, not in monthly charts.",
    "Cash is grouped by Payment.dateReceived. Lead Source Quality cohorts use lead-received business dates. Google Search and Google Ads remain separate sources.",
    "Profit by month and employee productivity preserve the application's existing estimates; they are not a replacement for finalized accounting or payroll.",
  ];
  return result;
}
