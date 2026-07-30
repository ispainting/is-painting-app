import bcrypt from "bcryptjs";
import { Prisma, PrismaClient } from "@prisma/client";
import { buildJobFinancialSummary } from "../job-financials/calculate-job-financials";
import { calculateDashboardMetrics } from "../job-financials/calculate-dashboard-metrics";
import { normalizeArray, normalizeBoolean, normalizeCity, normalizeDate, normalizeEmail, normalizeMoney, normalizePhone, normalizeState, normalizeText } from "./normalize";
import { normalizeExpenseCategory } from "./budget-map";
import { parseBudgetHistoryItem } from "./budget-history";
import { isResolvedEmployeeAlias, resolveCanonicalEmployeeLegacyId } from "./employee-resolution";
import { createEmptyMigrationReport, pushValidationIssue } from "./report";
import { normalizeLegacyId, uniqueByLegacyId } from "./utils";
import type {
  LegacyCustomerRecord,
  LegacyEmployeeRecord,
  LegacyExpenseRecord,
  LegacyMigrationSource,
  LegacyOpportunityRecord,
  LegacyPaymentRecord,
  LegacyProjectRecord,
  LegacyReceiptRecord,
  LegacyId,
  LegacyTimeEntryRecord,
  MigrationEntityType,
  MigrationReport,
} from "./types";

function entityLabel(entityType: MigrationEntityType): string {
  return entityType;
}

function asLegacyDate(value: Date | string | null | undefined): Date | undefined {
  return normalizeDate(value) ?? undefined;
}

function makeLegacyEmail(legacyId: string): string {
  return `legacy-${legacyId}@migration.local`;
}

function toDecimal(value: string | number | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(normalizeMoney(value));
}

function toNullableDecimal(value: string | number | null | undefined): Prisma.Decimal | null {
  if (value == null || value === "") return null;
  return new Prisma.Decimal(normalizeMoney(value));
}

function normalizeJobType(value: string | null | undefined): "interior" | "exterior" | "both" | "commercial" | "other" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "exterior") return "exterior";
  if (normalized === "both") return "both";
  if (normalized === "commercial") return "commercial";
  if (normalized === "other") return "other";
  return "interior";
}

function normalizeJobStatus(value: string | null | undefined): "estimate" | "sent" | "approved" | "active" | "completed" | "on_hold" | "cancelled" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "sent") return "sent";
  if (normalized === "approved") return "approved";
  if (normalized === "active") return "active";
  if (normalized === "completed") return "completed";
  if (normalized === "on_hold") return "on_hold";
  if (normalized === "cancelled") return "cancelled";
  return "estimate";
}

function normalizeTravelRateType(value: string | null | undefined): "regular" | "island" | "special" | "custom" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "island") return "island";
  if (normalized === "special") return "special";
  if (normalized === "custom") return "custom";
  return "regular";
}

function normalizeTimeReviewStatus(value: string | null | undefined): "pending" | "approved" | "rejected" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "rejected";
  return "pending";
}

function normalizeTimeRateType(value: string | null | undefined): "regular" | "island" | "special" | "travel" | "overtime" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "island") return "island";
  if (normalized === "special") return "special";
  if (normalized === "travel") return "travel";
  if (normalized === "overtime") return "overtime";
  return "regular";
}

function normalizePaymentMethod(value: string | null | undefined): "check" | "cash" | "credit_card" | "bank_transfer" | "other" {
  const normalized = normalizeText(value)?.toLowerCase().replace(/\s+/g, "_");
  if (normalized === "cash") return "cash";
  if (normalized === "credit_card" || normalized === "card") return "credit_card";
  if (normalized === "bank_transfer" || normalized === "ach" || normalized === "wire") return "bank_transfer";
  if (normalized === "other") return "other";
  return "check";
}

function normalizePaymentStatus(value: string | null | undefined): "received" | "deposited" | "cleared" | "bounced" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "deposited") return "deposited";
  if (normalized === "cleared") return "cleared";
  if (normalized === "bounced") return "bounced";
  return "received";
}

function normalizeExpenseReviewStatus(value: string | null | undefined): "pending_review" | "reviewed" | "approved" | "skipped" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "pending") return "pending_review";
  if (normalized === "reviewed") return "reviewed";
  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "skipped";
  if (normalized === "skipped") return "skipped";
  return "pending_review";
}

function normalizeExpenseStatus(value: string | null | undefined): "pending" | "approved" | "rejected" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "rejected" || normalized === "cancelled" || normalized === "canceled") return "rejected";
  return "pending";
}

function normalizeExpenseDuplicateStatus(value: string | null | undefined): "clear" | "possible_duplicate" | "confirmed_duplicate" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "possible_duplicate") return "possible_duplicate";
  if (normalized === "confirmed_duplicate") return "confirmed_duplicate";
  return "clear";
}

function parseExpenseExtractedData(value: unknown): Prisma.InputJsonValue | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return JSON.parse(trimmed) as Prisma.InputJsonValue;
  }
  return value as Prisma.InputJsonValue;
}

function normalizeExpenseReimbursementStatus(value: string | null | undefined): "not_applicable" | "pending" | "reimbursed" {
  const normalized = normalizeText(value)?.toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "reimbursed") return "reimbursed";
  return "not_applicable";
}

function buildSyntheticStoragePath(entityType: string, legacyId: string, fileName: string): string {
  const sanitized = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `migration/${entityType}/${legacyId}/${sanitized || "receipt"}`;
}

async function hashLegacyPassword(legacyId: string): Promise<string> {
  return bcrypt.hash(`legacy-${legacyId}`, 10);
}

export class MigrationImporter {
  private readonly source: LegacyMigrationSource;
  private readonly prisma: PrismaClient | any;
  private readonly projectOpportunityLinks = new Map<string, string>();
  private readonly approvedEmployeeEmailGroups = new Map<string, { canonicalLegacyId: string; legacyIds: string[] }>();

  constructor(prisma: PrismaClient | any, source: LegacyMigrationSource) {
    this.prisma = prisma;
    this.source = source;
  }

  async run(): Promise<MigrationReport> {
    const startedAt = new Date();
    const report = createEmptyMigrationReport(startedAt);

    if (this.validateDuplicateEmployeeEmails(report)) {
      report.completedAt = new Date();
      report.validationCompleted = true;
      report.success = false;
      report.financialEngineRecalculatedAllJobs = false;
      report.databaseReadyForProduction = false;
      return report;
    }

    await this.importCustomers(report);
    await this.importProjects(report);
    await this.importEmployees(report);
    await this.importTimeEntries(report);
    await this.importExpenses(report);
    await this.importPayments(report);
    await this.importOpportunities(report);
    await this.importReceipts(report);
    await this.relinkProjectOpportunities(report);

    await this.validate(report);
    await this.recalculateFinancials(report);

    this.finalizeEmployeeSummary(report);

    report.completedAt = new Date();
    report.validationCompleted = true;
    report.success = report.validationErrors.length === 0 && report.missingRelationships.length === 0 && report.duplicates.length === 0;
    report.financialEngineRecalculatedAllJobs = report.recalculatedJobs.length === report.databaseCounts.project;
    report.databaseReadyForProduction = report.success && report.financialEngineRecalculatedAllJobs;

    return report;
  }

  private finalizeEmployeeSummary(report: MigrationReport) {
    report.employeeImportSummary = {
      sourceEmployeeRecords: this.source.employees.length,
      distinctUsersRepresented: report.counts.employee.imported,
      createdEmployees: report.counts.employee.imported,
      explicitlyMergedEmployees: report.counts.employee.merged,
      unresolvedDuplicateEmailConflicts: report.validationErrors.filter(
        (issue) => issue.entityType === "employee" && issue.message.includes("Duplicate employee email conflict")
      ).length,
    };
  }

  private validateDuplicateEmployeeEmails(report: MigrationReport): boolean {
    const emailToRows = new Map<string, Array<{ legacyId: string; name: string }>>();

    for (const employee of this.source.employees) {
      const legacyId = normalizeLegacyId(employee.id);
      const email = normalizeEmail(employee.email);
      if (!email) continue;
      const name = normalizeText(employee.name) ?? "Unknown Employee";
      const rows = emailToRows.get(email) ?? [];
      rows.push({ legacyId, name });
      emailToRows.set(email, rows);
    }

    let hasConflict = false;
    for (const [email, rows] of emailToRows.entries()) {
      const uniqueLegacyIds = Array.from(new Set(rows.map((row) => row.legacyId)));
      if (uniqueLegacyIds.length <= 1) continue;

       const canonicalSet = new Set(uniqueLegacyIds.map((legacyId) => resolveCanonicalEmployeeLegacyId(legacyId)));
       const hasSingleCanonical = canonicalSet.size === 1;
       const canonicalLegacyId = hasSingleCanonical ? Array.from(canonicalSet)[0]! : null;
       const isApprovedMerge =
         hasSingleCanonical &&
         canonicalLegacyId != null &&
         uniqueLegacyIds.includes(canonicalLegacyId) &&
         uniqueLegacyIds.some((legacyId) => legacyId !== canonicalLegacyId && isResolvedEmployeeAlias(legacyId));

       if (isApprovedMerge && canonicalLegacyId) {
         this.approvedEmployeeEmailGroups.set(email, {
           canonicalLegacyId,
           legacyIds: uniqueLegacyIds,
         });
         continue;
       }

      hasConflict = true;

      for (const row of rows) {
        const related = uniqueLegacyIds.filter((id) => id !== row.legacyId).join(", ");
        const message = `Duplicate employee email conflict: email ${email} appears on multiple legacy employee IDs (${uniqueLegacyIds.join(", ")}) with names (${rows.map((item) => item.name).join(" | ")}).`;
        pushValidationIssue(report, {
          entityType: "employee",
          severity: "error",
          legacyId: row.legacyId,
          relatedLegacyId: related,
          message,
        });
      }
    }

    return hasConflict;
  }

  private async importCustomers(report: MigrationReport) {
    const { unique, duplicates } = uniqueByLegacyId(this.source.customers);
    for (const duplicate of duplicates) {
      report.counts.customer.duplicates += 1;
      report.duplicates.push({
        entityType: "customer",
        severity: "warning",
        legacyId: normalizeLegacyId(duplicate.id),
        message: "Duplicate customer legacy ID in source batch.",
      });
    }

    for (const customer of unique) {
      const legacyId = normalizeLegacyId(customer.id);
      const existing = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "customer", legacyId } },
      });
      const data = this.normalizeCustomer(customer);

      if (existing) {
        await this.prisma.customer.update({ where: { id: existing.newId }, data });
        report.counts.customer.skipped += 1;
        continue;
      }

      const created = await this.prisma.customer.create({ data });
      await this.prisma.migrationMap.create({
        data: { entityType: "customer", legacyId, newId: created.id },
      });
      report.counts.customer.imported += 1;
    }
  }

  private async importProjects(report: MigrationReport) {
    const { unique, duplicates } = uniqueByLegacyId(this.source.projects);
    for (const duplicate of duplicates) {
      report.counts.project.duplicates += 1;
      report.duplicates.push({
        entityType: "project",
        severity: "warning",
        legacyId: normalizeLegacyId(duplicate.id),
        message: "Duplicate project legacy ID in source batch.",
      });
    }

    for (const project of unique) {
      const legacyId = normalizeLegacyId(project.id);
      const customerId = await this.resolveMappedId("customer", project.customerId, report, legacyId, "customer relationship missing for project");
      if (customerId == null) continue;

      const existing = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "project", legacyId } },
      });
      const data = this.normalizeProject(project, customerId);

      let jobId: number;
      if (existing) {
        const updated = await this.prisma.job.update({ where: { id: existing.newId }, data });
        jobId = updated.id;
        report.counts.project.skipped += 1;
      } else {
        const created = await this.prisma.job.create({ data });
        jobId = created.id;
        await this.prisma.migrationMap.create({
          data: { entityType: "project", legacyId, newId: jobId },
        });
        report.counts.project.imported += 1;
      }

      if (Array.isArray(project.materials) && project.materials.length > 0) {
        for (const material of project.materials) {
          await this.importMaterial(report, legacyId, jobId, material);
        }
      }

      if (project.opportunityId != null) {
        this.projectOpportunityLinks.set(legacyId, normalizeLegacyId(project.opportunityId));
      }
    }
  }

  private async importEmployees(report: MigrationReport) {
    const { unique, duplicates } = uniqueByLegacyId(this.source.employees);
    for (const duplicate of duplicates) {
      report.counts.employee.duplicates += 1;
      report.duplicates.push({
        entityType: "employee",
        severity: "warning",
        legacyId: normalizeLegacyId(duplicate.id),
        message: "Duplicate employee legacy ID in source batch.",
      });
    }

    const canonicalEmployees = unique.filter(
      (employee) => resolveCanonicalEmployeeLegacyId(normalizeLegacyId(employee.id)) === normalizeLegacyId(employee.id)
    );
    const aliasEmployees = unique.filter(
      (employee) => resolveCanonicalEmployeeLegacyId(normalizeLegacyId(employee.id)) !== normalizeLegacyId(employee.id)
    );

    for (const employee of canonicalEmployees) {
      const legacyId = normalizeLegacyId(employee.id);
      const existing = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "employee", legacyId } },
      });
      const data = await this.normalizeEmployee(employee, legacyId);

      if (existing) {
        await this.prisma.user.update({ where: { id: existing.newId }, data });
        report.counts.employee.skipped += 1;
        continue;
      }

      const existingUserByEmail = data.email
        ? await this.prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })
        : null;
      if (existingUserByEmail) {
        await this.prisma.user.update({ where: { id: existingUserByEmail.id }, data });
        await this.prisma.migrationMap.create({
          data: { entityType: "employee", legacyId, newId: existingUserByEmail.id },
        });
        report.counts.employee.skipped += 1;
        continue;
      }

      const created = await this.prisma.user.create({ data });
      await this.prisma.migrationMap.create({
        data: { entityType: "employee", legacyId, newId: created.id },
      });
      report.counts.employee.imported += 1;
    }

    for (const employee of aliasEmployees) {
      const aliasLegacyId = normalizeLegacyId(employee.id);
      const canonicalLegacyId = resolveCanonicalEmployeeLegacyId(aliasLegacyId);
      const aliasExisting = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "employee", legacyId: aliasLegacyId } },
      });
      if (aliasExisting) {
        report.counts.employee.skipped += 1;
        continue;
      }

      const canonicalMapping = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "employee", legacyId: canonicalLegacyId } },
      });
      if (!canonicalMapping) {
        pushValidationIssue(report, {
          entityType: "employee",
          severity: "error",
          legacyId: aliasLegacyId,
          relatedLegacyId: canonicalLegacyId,
          message: `Approved employee merge could not be applied because canonical legacy employee ${canonicalLegacyId} is missing.`,
        });
        continue;
      }

      await this.prisma.migrationMap.create({
        data: { entityType: "employee", legacyId: aliasLegacyId, newId: canonicalMapping.newId },
      });

      report.counts.employee.merged += 1;
      report.employeeMerges.push({
        canonicalLegacyId,
        canonicalName: normalizeText(canonicalEmployees.find((row) => normalizeLegacyId(row.id) === canonicalLegacyId)?.name) ??
          "Canonical Employee",
        mergedLegacyId: aliasLegacyId,
        mergedName: normalizeText(employee.name) ?? "Merged Employee",
        email: normalizeEmail(employee.email) ?? "",
      });
    }
  }

  private async importTimeEntries(report: MigrationReport) {
    const { unique, duplicates } = uniqueByLegacyId(this.source.timeEntries);
    for (const duplicate of duplicates) {
      report.counts.time_entry.duplicates += 1;
      report.duplicates.push({
        entityType: "time_entry",
        severity: "warning",
        legacyId: normalizeLegacyId(duplicate.id),
        message: "Duplicate time entry legacy ID in source batch.",
      });
    }

    for (const timeEntry of unique) {
      const legacyId = normalizeLegacyId(timeEntry.id);
      const jobId = await this.resolveMappedId("project", timeEntry.projectId, report, legacyId, "project relationship missing for time entry");
      if (jobId == null) continue;
      const userId = await this.resolveMappedId("employee", timeEntry.employeeId, report, legacyId, "employee relationship missing for time entry");
      if (userId == null) continue;
      const approvedById = timeEntry.approvedByEmployeeId == null
        ? null
        : await this.resolveMappedId("employee", timeEntry.approvedByEmployeeId, report, legacyId, "approver relationship missing for time entry");
      if (timeEntry.approvedByEmployeeId != null && approvedById == null) continue;

      const existing = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "time_entry", legacyId } },
      });
      const data = this.normalizeTimeEntry(timeEntry, jobId, userId, approvedById);

      if (existing) {
        await this.prisma.timeEntry.update({ where: { id: existing.newId }, data });
        report.counts.time_entry.skipped += 1;
        continue;
      }

      const created = await this.prisma.timeEntry.create({ data });
      await this.prisma.migrationMap.create({
        data: { entityType: "time_entry", legacyId, newId: created.id },
      });
      report.counts.time_entry.imported += 1;
    }
  }

  private async importExpenses(report: MigrationReport) {
    const { unique, duplicates } = uniqueByLegacyId(this.source.expenses);
    for (const duplicate of duplicates) {
      report.counts.expense.duplicates += 1;
      report.duplicates.push({
        entityType: "expense",
        severity: "warning",
        legacyId: normalizeLegacyId(duplicate.id),
        message: "Duplicate expense legacy ID in source batch.",
      });
    }

    for (const expense of unique) {
      const legacyId = normalizeLegacyId(expense.id);
      const hasJobReference = expense.projectId != null && expense.projectId !== "";
      const jobId = hasJobReference
        ? await this.resolveMappedId("project", expense.projectId as LegacyId, report, legacyId, "project relationship missing for expense")
        : null;
      if (hasJobReference && jobId == null) continue;
      const submittedById = await this.resolveMappedId("employee", expense.submittedByEmployeeId, report, legacyId, "submitted-by relationship missing for expense");
      if (submittedById == null) continue;
      const employeeId = expense.employeeId == null ? null : await this.resolveMappedId("employee", expense.employeeId, report, legacyId, "employee relationship missing for expense");
      if (expense.employeeId != null && employeeId == null) continue;
      const approvedById = expense.approvedByEmployeeId == null
        ? null
        : await this.resolveMappedId("employee", expense.approvedByEmployeeId, report, legacyId, "approver relationship missing for expense");
      if (expense.approvedByEmployeeId != null && approvedById == null) continue;

      const existing = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "expense", legacyId } },
      });
      const data = this.normalizeExpense(expense, jobId, submittedById, employeeId, approvedById);

      let expenseId: number;
      if (existing) {
        const updated = await this.prisma.expense.update({ where: { id: existing.newId }, data });
        expenseId = updated.id;
        report.counts.expense.skipped += 1;
      } else {
        const created = await this.prisma.expense.create({ data });
        expenseId = created.id;
        await this.prisma.migrationMap.create({
          data: { entityType: "expense", legacyId, newId: expenseId },
        });
        report.counts.expense.imported += 1;
      }

    }
  }

  private async importPayments(report: MigrationReport) {
    const { unique, duplicates } = uniqueByLegacyId(this.source.payments);
    for (const duplicate of duplicates) {
      report.counts.payment.duplicates += 1;
      report.duplicates.push({
        entityType: "payment",
        severity: "warning",
        legacyId: normalizeLegacyId(duplicate.id),
        message: "Duplicate payment legacy ID in source batch.",
      });
    }

    for (const payment of unique) {
      const legacyId = normalizeLegacyId(payment.id);
      const jobId = await this.resolveMappedId("project", payment.projectId, report, legacyId, "project relationship missing for payment");
      if (jobId == null) continue;
      const recordedById = payment.recordedByEmployeeId == null
        ? null
        : await this.resolveMappedId("employee", payment.recordedByEmployeeId, report, legacyId, "recorded-by relationship missing for payment");
      if (payment.recordedByEmployeeId != null && recordedById == null) continue;

      const existing = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "payment", legacyId } },
      });
      if (recordedById == null) {
        pushValidationIssue(report, {
          entityType: "payment",
          severity: "error",
          legacyId,
          message: "Missing relationship: recorded-by employee is required for payment.",
        });
        continue;
      }

      const data = this.normalizePayment(payment, jobId, recordedById);

      if (existing) {
        await this.prisma.payment.update({ where: { id: existing.newId }, data });
        report.counts.payment.skipped += 1;
        continue;
      }

      const created = await this.prisma.payment.create({ data });
      await this.prisma.migrationMap.create({
        data: { entityType: "payment", legacyId, newId: created.id },
      });
      report.counts.payment.imported += 1;
    }
  }

  private async importOpportunities(report: MigrationReport) {
    const { unique, duplicates } = uniqueByLegacyId(this.source.opportunities);
    for (const duplicate of duplicates) {
      report.counts.opportunity.duplicates += 1;
      report.duplicates.push({
        entityType: "opportunity",
        severity: "warning",
        legacyId: normalizeLegacyId(duplicate.id),
        message: "Duplicate opportunity legacy ID in source batch.",
      });
    }

    for (const opportunity of unique) {
      const legacyId = normalizeLegacyId(opportunity.id);
      const customerId = await this.resolveMappedId("customer", opportunity.customerId, report, legacyId, "customer relationship missing for opportunity");
      if (customerId == null) continue;
      const assignedToId = opportunity.assignedToEmployeeId == null
        ? null
        : await this.resolveMappedId("employee", opportunity.assignedToEmployeeId, report, legacyId, "assigned employee relationship missing for opportunity");
      if (opportunity.assignedToEmployeeId != null && assignedToId == null) continue;

      const existing = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "opportunity", legacyId } },
      });
      const data = this.normalizeOpportunity(opportunity, customerId, assignedToId);

      let opportunityId: number;
      if (existing) {
        const updated = await this.prisma.opportunity.update({ where: { id: existing.newId }, data });
        opportunityId = updated.id;
        report.counts.opportunity.skipped += 1;
      } else {
        const created = await this.prisma.opportunity.create({ data });
        opportunityId = created.id;
        await this.prisma.migrationMap.create({
          data: { entityType: "opportunity", legacyId, newId: opportunityId },
        });
        report.counts.opportunity.imported += 1;
      }

      const linkedProjectLegacyIds = Array.from(this.projectOpportunityLinks.entries())
        .filter(([, linkedOpportunityLegacyId]) => linkedOpportunityLegacyId === legacyId)
        .map(([projectLegacyId]) => projectLegacyId);

      for (const projectLegacyId of linkedProjectLegacyIds) {
        const projectMapping = await this.prisma.migrationMap.findUnique({
          where: { entityType_legacyId: { entityType: "project", legacyId: projectLegacyId } },
        });
        if (!projectMapping) continue;
        await this.prisma.job.update({ where: { id: projectMapping.newId }, data: { opportunityId } });
      }
    }
  }

  private async importReceipts(report: MigrationReport) {
    const receipts = this.source.receipts ?? [];
    const { unique, duplicates } = uniqueByLegacyId(receipts);

    for (const duplicate of duplicates) {
      report.counts.receipt.duplicates += 1;
      report.duplicates.push({
        entityType: "receipt",
        severity: "warning",
        legacyId: normalizeLegacyId(duplicate.id),
        message: "Duplicate receipt legacy ID in source batch.",
      });
    }

    for (const receipt of unique) {
      const legacyId = normalizeLegacyId(receipt.id);
      const expenseLegacyId = receipt.expenseId ?? null;
      if (expenseLegacyId == null) {
        pushValidationIssue(report, {
          entityType: "receipt",
          severity: "error",
          legacyId,
          message: "Missing relationship: receipt is not linked to an expense.",
        });
        continue;
      }

      const expenseId = await this.resolveMappedId("expense", expenseLegacyId, report, legacyId, "expense relationship missing for receipt");
      if (expenseId == null) continue;
      const uploadedById = receipt.uploadedByEmployeeId == null
        ? null
        : await this.resolveMappedId("employee", receipt.uploadedByEmployeeId, report, legacyId, "uploaded-by relationship missing for receipt");
      if (receipt.uploadedByEmployeeId != null && uploadedById == null) continue;

      const existing = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "receipt", legacyId } },
      });
      const data = this.normalizeReceipt(receipt, expenseId, uploadedById ?? (await this.getExpenseSubmittedById(expenseId)));

      if (existing) {
        await this.prisma.expenseAttachment.update({ where: { id: existing.newId }, data });
        report.counts.receipt.skipped += 1;
        continue;
      }

      const created = await this.prisma.expenseAttachment.create({ data });
      await this.prisma.migrationMap.create({
        data: { entityType: "receipt", legacyId, newId: created.id },
      });
      report.counts.receipt.imported += 1;
    }
  }

  private async relinkProjectOpportunities(report: MigrationReport) {
    // Opportunistic second pass in case source order puts project references ahead of opportunity rows.
    for (const [projectLegacyId, opportunityLegacyId] of this.projectOpportunityLinks.entries()) {
      const projectMapping = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "project", legacyId: projectLegacyId } },
      });
      const opportunityMapping = await this.prisma.migrationMap.findUnique({
        where: { entityType_legacyId: { entityType: "opportunity", legacyId: opportunityLegacyId } },
      });
      if (!projectMapping || !opportunityMapping) continue;
      await this.prisma.job.update({ where: { id: projectMapping.newId }, data: { opportunityId: opportunityMapping.newId } });
    }

    // Keep the report stable even when no projects point at opportunities.
    if (report.counts.opportunity.imported === 0 && this.source.opportunities.length > 0) {
      report.counts.opportunity.skipped += 0;
    }
  }

  private async importMaterial(report: MigrationReport, projectLegacyId: string, jobId: number, material: any) {
    const legacyId = normalizeLegacyId(material.id);
    const existing = await this.prisma.migrationMap.findUnique({
      where: { entityType_legacyId: { entityType: "job_material", legacyId } },
    });

    const data = {
      jobId,
      inventoryItemId: null,
      name: normalizeText(material.name) ?? "Material",
      description: normalizeText(material.description),
      quantity: toDecimal(material.quantity ?? 0),
      unit: normalizeText(material.unit) ?? "unit",
      unitCost: toDecimal(material.unitCost ?? 0),
      totalCost: toDecimal(material.totalCost ?? 0),
      sortOrder: material.sortOrder ?? 0,
      createdAt: asLegacyDate(material.createdAt) ?? new Date(),
      updatedAt: asLegacyDate(material.updatedAt) ?? new Date(),
    };

    if (existing) {
      await this.prisma.jobMaterial.update({ where: { id: existing.newId }, data });
      report.counts.job_material.skipped += 1;
      return;
    }

    const created = await this.prisma.jobMaterial.create({ data });
    await this.prisma.migrationMap.create({
      data: { entityType: "job_material", legacyId, newId: created.id },
    });
    report.counts.job_material.imported += 1;
  }

  private async validate(report: MigrationReport) {
    const dbCounts: Record<MigrationEntityType, number> = {
      customer: await this.prisma.migrationMap.count({ where: { entityType: "customer" } }),
      project: await this.prisma.migrationMap.count({ where: { entityType: "project" } }),
      employee: await this.prisma.migrationMap.count({ where: { entityType: "employee" } }),
      time_entry: await this.prisma.migrationMap.count({ where: { entityType: "time_entry" } }),
      expense: await this.prisma.migrationMap.count({ where: { entityType: "expense" } }),
      payment: await this.prisma.migrationMap.count({ where: { entityType: "payment" } }),
      opportunity: await this.prisma.migrationMap.count({ where: { entityType: "opportunity" } }),
      receipt: await this.prisma.migrationMap.count({ where: { entityType: "receipt" } }),
      job_material: await this.prisma.migrationMap.count({ where: { entityType: "job_material" } }),
    };
    report.databaseCounts = dbCounts;

    const expectedCustomers = new Set(this.source.customers.map((row) => normalizeLegacyId(row.id))).size;
    const expectedProjects = new Set(this.source.projects.map((row) => normalizeLegacyId(row.id))).size;
    const expectedEmployees = new Set(this.source.employees.map((row) => normalizeLegacyId(row.id))).size;
    const expectedTimeEntries = new Set(this.source.timeEntries.map((row) => normalizeLegacyId(row.id))).size;
    const expectedExpenses = new Set(this.source.expenses.map((row) => normalizeLegacyId(row.id))).size;
    const expectedPayments = new Set(this.source.payments.map((row) => normalizeLegacyId(row.id))).size;
    const expectedOpportunities = new Set(this.source.opportunities.map((row) => normalizeLegacyId(row.id))).size;
    const expectedReceipts = new Set((this.source.receipts ?? []).map((row) => normalizeLegacyId(row.id))).size;
    const expectedJobMaterials = new Set(
      this.source.projects.flatMap((project) => (project.materials ?? []).map((material) => normalizeLegacyId(material.id)))
    ).size;

    const checks: Array<[MigrationEntityType, number, number]> = [
      ["customer", expectedCustomers, dbCounts.customer],
      ["project", expectedProjects, dbCounts.project],
      ["employee", expectedEmployees, dbCounts.employee],
      ["time_entry", expectedTimeEntries, dbCounts.time_entry],
      ["expense", expectedExpenses, dbCounts.expense],
      ["payment", expectedPayments, dbCounts.payment],
      ["opportunity", expectedOpportunities, dbCounts.opportunity],
      ["receipt", expectedReceipts, dbCounts.receipt],
      ["job_material", expectedJobMaterials, dbCounts.job_material],
    ];

    for (const [entityType, expected, actual] of checks) {
      if (expected !== actual) {
        pushValidationIssue(report, {
          entityType,
          severity: "error",
          message: `Expected ${expected} imported ${entityLabel(entityType)} records but found ${actual}.`,
        });
      }
    }

    if (this.source.receipts && this.source.receipts.length > 0 && dbCounts.receipt === 0) {
      pushValidationIssue(report, {
        entityType: "receipt",
        severity: "warning",
        message: "No receipts were imported.",
      });
    }

    report.validationCompleted = true;
  }

  private async recalculateFinancials(report: MigrationReport) {
    const projectMappings = await this.prisma.migrationMap.findMany({
      where: { entityType: "project" },
      select: { legacyId: true, newId: true },
    });

    const recalculatedJobs = [] as MigrationReport["recalculatedJobs"];

    for (const mapping of projectMappings) {
      const job = await this.prisma.job.findUnique({
        where: { id: mapping.newId },
        select: {
          id: true,
          contractAmount: true,
          totalEstimate: true,
          laborBudget: true,
          materialsBudget: true,
          equipmentBudget: true,
          subcontractorBudget: true,
          travelBudget: true,
          otherBudget: true,
          travelPayEnabled: true,
          defaultTravelHours: true,
          travelRateType: true,
          customTravelRate: true,
          createdAt: true,
          expenses: {
            select: {
              id: true,
              jobId: true,
              status: true,
              category: true,
              amount: true,
              vendor: true,
              receiptUrl: true,
              invoiceNumber: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          timeEntries: {
            select: {
              id: true,
              jobId: true,
              userId: true,
              clockIn: true,
              updatedAt: true,
              reviewStatus: true,
              paidHours: true,
              grossHours: true,
              hoursWorked: true,
              travelHours: true,
              rateType: true,
              isIslandJob: true,
              specialPayEnabled: true,
              hourlyRateAdjustment: true,
              user: { select: { name: true, hourlyRate: true } },
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              dateReceived: true,
              method: true,
            },
          },
        },
      });

      if (!job) continue;

      const summary = buildJobFinancialSummary({
        context: {
          jobId: job.id,
          contractAmount: Number(job.contractAmount ?? 0),
          totalEstimate: Number(job.totalEstimate ?? 0),
          laborBudget: Number(job.laborBudget ?? 0),
          materialsBudget: Number(job.materialsBudget ?? 0),
          equipmentBudget: Number(job.equipmentBudget ?? 0),
          subcontractorBudget: Number(job.subcontractorBudget ?? 0),
          travelBudget: Number(job.travelBudget ?? 0),
          otherBudget: Number(job.otherBudget ?? 0),
          travelPayEnabled: Boolean(job.travelPayEnabled),
          defaultTravelHours: Number(job.defaultTravelHours ?? 0),
          travelRateType: job.travelRateType,
          customTravelRate: job.customTravelRate == null ? null : Number(job.customTravelRate),
        },
        budgetCreatedAt: job.createdAt,
        budgetChangeHistory: await this.loadBudgetHistory(job.id),
        expenses: job.expenses.map((expense: any) => ({
          id: expense.id,
          jobId: expense.jobId,
          status: expense.status,
          category: expense.category,
          amount: Number(expense.amount),
          vendor: expense.vendor,
          receiptUrl: expense.receiptUrl,
          invoiceNumber: expense.invoiceNumber,
          createdAt: expense.createdAt,
          updatedAt: expense.updatedAt,
        })),
        timeEntries: job.timeEntries.map((entry: any) => ({
          id: entry.id,
          jobId: entry.jobId,
          userId: entry.userId,
          userName: entry.user.name,
          clockIn: entry.clockIn,
          updatedAt: entry.updatedAt,
          reviewStatus: entry.reviewStatus,
          paidHours: entry.paidHours == null ? null : Number(entry.paidHours),
          grossHours: entry.grossHours == null ? null : Number(entry.grossHours),
          hoursWorked: entry.hoursWorked == null ? null : Number(entry.hoursWorked),
          travelHours: entry.travelHours == null ? null : Number(entry.travelHours),
          rateType: entry.rateType,
          isIslandJob: Boolean(entry.isIslandJob),
          specialPayEnabled: Boolean(entry.specialPayEnabled),
          hourlyRateAdjustment: Number(entry.hourlyRateAdjustment),
          userHourlyRate: Number(entry.user.hourlyRate ?? 0),
        })),
        paymentEvents: job.payments.map((payment: any) => ({
          id: payment.id,
          at: payment.dateReceived,
          amount: Number(payment.amount),
          method: payment.method,
        })),
      });

      const dashboardInput = summaryToDashboardInput(summary);

      recalculatedJobs.push({
        legacyProjectId: mapping.legacyId,
        jobId: job.id,
        summary,
        dashboardMetrics: calculateDashboardMetrics({ jobs: [dashboardInput] }),
      });
    }

    report.recalculatedJobs = recalculatedJobs;
    report.financialTotals = {
      payrollTotal: recalculatedJobs.reduce((sum, job) => sum + job.summary.actualLaborCost, 0),
      expenseTotal: recalculatedJobs.reduce((sum, job) => sum + job.summary.actualExpenseCost, 0),
      paymentTotal: await this.sumPayments(),
      historicalLaborTotal: recalculatedJobs.reduce((sum, job) => sum + job.summary.actualLaborCost, 0),
      historicalMaterialTotal: await this.sumJobMaterials(),
    };
    report.dashboardMetrics = calculateDashboardMetrics({ jobs: recalculatedJobs.map((job) => summaryToDashboardInput(job.summary)) });
  }

  private async sumPayments(): Promise<number> {
    const mappings = await this.prisma.migrationMap.findMany({
      where: { entityType: "payment" },
      select: { newId: true },
    });
    const rows = mappings.length > 0
      ? await this.prisma.payment.findMany({
          where: { id: { in: mappings.map((mapping: { newId: number }) => mapping.newId) } },
          select: { amount: true },
        })
      : [];
    return rows.reduce((sum: number, row: { amount: Prisma.Decimal | number }) => sum + Number(row.amount), 0);
  }

  private async sumJobMaterials(): Promise<number> {
    const mappings = await this.prisma.migrationMap.findMany({
      where: { entityType: "job_material" },
      select: { newId: true },
    });
    const rows = mappings.length > 0
      ? await this.prisma.jobMaterial.findMany({
          where: { id: { in: mappings.map((mapping: { newId: number }) => mapping.newId) } },
          select: { totalCost: true },
        })
      : [];
    return rows.reduce((sum: number, row: { totalCost: Prisma.Decimal | number }) => sum + Number(row.totalCost), 0);
  }

  private async getExpenseSubmittedById(expenseId: number): Promise<number> {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      select: { submittedById: true },
    });
    if (!expense) {
      throw new Error(`Expense ${expenseId} not found while resolving receipt uploader.`);
    }
    return expense.submittedById;
  }

  private async loadBudgetHistory(jobId: number) {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType: "job", entityId: jobId, action: "job_budget_updated" },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    return logs.map((log: any) => parseBudgetHistoryItem(log)).filter(Boolean);
  }

  private async resolveMappedId(entityType: MigrationEntityType, legacyId: LegacyId, report: MigrationReport, sourceLegacyId: string, message: string): Promise<number | null> {
    const normalizedLegacyId = normalizeLegacyId(legacyId);
    const mapping = await this.prisma.migrationMap.findUnique({
      where: { entityType_legacyId: { entityType, legacyId: normalizedLegacyId } },
    });
    if (!mapping) {
      pushValidationIssue(report, {
        entityType,
        severity: "error",
        legacyId: sourceLegacyId,
        relatedLegacyId: normalizedLegacyId,
        message: `Missing relationship: ${message}.`,
      });
      return null;
    }
    return mapping.newId;
  }

  private normalizeCustomer(customer: LegacyCustomerRecord) {
    const now = asLegacyDate(customer.updatedAt ?? customer.createdAt) ?? new Date();
    return {
      name: normalizeText(customer.name) ?? "Unnamed Customer",
      contactName: normalizeText(customer.contactName),
      email: normalizeEmail(customer.email),
      phone: normalizePhone(customer.phone),
      address: normalizeText(customer.address),
      city: normalizeCity(customer.city),
      state: normalizeState(customer.state),
      zipCode: normalizeText(customer.zipCode),
      source: normalizeText(customer.source),
      leadSource: normalizeText(customer.leadSource),
      referralSource: normalizeText(customer.referralSource),
      status: normalizeText(customer.status),
      preferredCommunication: normalizeText(customer.preferredCommunication),
      tags: normalizeArray(customer.tags),
      notes: normalizeText(customer.notes),
      lastContactAt: asLegacyDate(customer.lastContactAt),
      nextFollowUpAt: asLegacyDate(customer.nextFollowUpAt),
      deletedAt: null,
      createdAt: asLegacyDate(customer.createdAt) ?? now,
      updatedAt: now,
      externalId: normalizeText(customer.externalId),
    };
  }

  private normalizeProject(project: LegacyProjectRecord, customerId: number) {
    const now = asLegacyDate(project.updatedAt ?? project.createdAt) ?? new Date();
    return {
      customerId,
      opportunityId: null,
      estimateNumber: `MIG-${normalizeLegacyId(project.id)}`,
      name: normalizeText(project.name) ?? "Imported Project",
      status: normalizeJobStatus(project.status),
      jobType: normalizeJobType(project.jobType),
      address: normalizeText(project.address),
      city: normalizeCity(project.city),
      state: normalizeState(project.state),
      zipCode: normalizeText(project.zipCode),
      scopeOfWork: normalizeText(project.scopeOfWork),
      notes: normalizeText(project.notes),
      materialsBudget: toDecimal(project.materialsBudget ?? 0),
      laborBudget: toDecimal(project.laborBudget ?? 0),
      subcontractorBudget: project.subcontractorBudget == null ? null : toNullableDecimal(project.subcontractorBudget),
      equipmentBudget: toDecimal(project.equipmentBudget ?? 0),
      travelBudget: toDecimal(project.travelBudget ?? 0),
      otherBudget: toDecimal(project.otherBudget ?? 0),
      wcPercent: toDecimal(project.wcPercent ?? 0),
      glPercent: toDecimal(project.glPercent ?? 0),
      overheadPercent: toDecimal(project.overheadPercent ?? 0),
      markupPercent: toDecimal(project.markupPercent ?? 0),
      taxPercent: toDecimal(project.taxPercent ?? 0),
      subtotalBeforeMarkup: toDecimal(project.subtotalBeforeMarkup ?? 0),
      totalEstimate: toDecimal(project.totalEstimate ?? 0),
      contractAmount: toDecimal(project.contractAmount ?? 0),
      budgetLocked: normalizeBoolean(project.budgetLocked),
      isIslandJob: false,
      specialPayEnabled: normalizeBoolean(project.specialPayEnabled),
      hourlyRateAdjustment: toDecimal(project.hourlyRateAdjustment ?? 0),
      travelPayEnabled: normalizeBoolean(project.travelPayEnabled),
      defaultTravelHours: toDecimal(project.defaultTravelHours ?? 0),
      travelRateType: normalizeTravelRateType(project.travelRateType),
      customTravelRate: project.customTravelRate == null ? null : toNullableDecimal(project.customTravelRate),
      sentAt: asLegacyDate(project.sentAt),
      approvedAt: asLegacyDate(project.approvedAt),
      startDate: asLegacyDate(project.startDate),
      endDate: asLegacyDate(project.endDate),
      deletedAt: asLegacyDate(project.deletedAt),
      createdAt: asLegacyDate(project.createdAt) ?? now,
      updatedAt: now,
      externalId: normalizeText(project.externalId),
    };
  }

  private async normalizeEmployee(employee: LegacyEmployeeRecord, legacyId: string) {
    const now = asLegacyDate(employee.updatedAt ?? employee.createdAt) ?? new Date();
    const email = normalizeEmail(employee.email) ?? makeLegacyEmail(legacyId);
    return {
      email,
      name: normalizeText(employee.name) ?? "Imported Employee",
      password: await hashLegacyPassword(legacyId),
      role: employee.role === "admin" ? "admin" : "employee",
      phone: normalizePhone(employee.phone),
      hourlyRate: toNullableDecimal(employee.hourlyRate),
      employeeRole: normalizeText(employee.employeeRole),
      profilePhotoUrl: normalizeText(employee.profilePhotoUrl),
      address: normalizeText(employee.address),
      emergencyContactName: normalizeText(employee.emergencyContactName),
      emergencyContactPhone: normalizePhone(employee.emergencyContactPhone),
      hireDate: asLegacyDate(employee.hireDate),
      employeeCode: normalizeText(employee.employeeCode),
      specialJobAdjustment: toDecimal(employee.specialJobAdjustment ?? 0),
      overtimeMultiplier: toDecimal(employee.overtimeMultiplier ?? 1.5),
      overtimeRate: toNullableDecimal(employee.overtimeRate),
      travelPayEnabled: normalizeBoolean(employee.travelPayEnabled),
      defaultTravelHours: toDecimal(employee.defaultTravelHours ?? 0),
      travelRateType: normalizeTravelRateType(employee.travelRateType),
      customTravelRate: employee.customTravelRate == null ? null : toNullableDecimal(employee.customTravelRate),
      payrollNotes: normalizeText(employee.payrollNotes),
      skills: normalizeArray(employee.skills),
      languages: normalizeArray(employee.languages),
      isActive: employee.isActive ?? true,
      createdAt: asLegacyDate(employee.createdAt) ?? now,
      updatedAt: now,
    };
  }

  private normalizeTimeEntry(timeEntry: LegacyTimeEntryRecord, jobId: number, userId: number, approvedById: number | null) {
    const now = asLegacyDate(timeEntry.updatedAt ?? timeEntry.createdAt) ?? new Date();
    return {
      userId,
      workType: null,
      jobId,
      clockIn: asLegacyDate(timeEntry.clockIn) ?? now,
      clockOut: asLegacyDate(timeEntry.clockOut),
      hoursWorked: toNullableDecimal(timeEntry.hoursWorked),
      breakMinutes: timeEntry.breakMinutes ?? 0,
      notes: normalizeText(timeEntry.notes),
      notAtJobsiteReason: normalizeText(timeEntry.notAtJobsiteReason),
      clockInLatitude: toNullableDecimal(timeEntry.clockInLatitude),
      clockInLongitude: toNullableDecimal(timeEntry.clockInLongitude),
      clockOutLatitude: toNullableDecimal(timeEntry.clockOutLatitude),
      clockOutLongitude: toNullableDecimal(timeEntry.clockOutLongitude),
      clockInAccuracy: toNullableDecimal(timeEntry.clockInAccuracy),
      clockOutAccuracy: toNullableDecimal(timeEntry.clockOutAccuracy),
      isManual: normalizeBoolean(timeEntry.isManual),
      isIslandJob: normalizeBoolean(timeEntry.isIslandJob),
      specialPayEnabled: normalizeBoolean(timeEntry.specialPayEnabled),
      hourlyRateAdjustment: toDecimal(timeEntry.hourlyRateAdjustment ?? 0),
      rateType: normalizeTimeRateType(timeEntry.rateType),
      travelHours: toNullableDecimal(timeEntry.travelHours),
      overtimeOverride: normalizeBoolean(timeEntry.overtimeOverride),
      reviewStatus: normalizeTimeReviewStatus(timeEntry.reviewStatus),
      managerNotes: normalizeText(timeEntry.managerNotes),
      approvedById,
      createdAt: asLegacyDate(timeEntry.createdAt) ?? now,
      updatedAt: now,
      grossHours: toNullableDecimal(timeEntry.grossHours),
      paidHours: toNullableDecimal(timeEntry.paidHours),
      breakStartedAt: null,
      breakEndedAt: null,
      roundedClockIn: null,
      roundedClockOut: null,
      roundedBreakStartedAt: null,
      roundedBreakEndedAt: null,
      breakDurationMinutes: timeEntry.breakMinutes ?? 0,
      breakDeductionMinutes: 0,
      lateBreakMinutes: 0,
      calcVersion: 1,
      attendanceFlags: null,
    };
  }

  private normalizeExpense(expense: LegacyExpenseRecord, jobId: number | null, submittedById: number, employeeId: number | null, approvedById: number | null) {
    const now = asLegacyDate(expense.updatedAt ?? expense.createdAt) ?? new Date();
    return {
      jobId,
      submittedById,
      employeeId,
      approvedById,
      vendor: normalizeText(expense.vendor),
      category: normalizeExpenseCategory(expense.category),
      amount: toDecimal(expense.amount),
      subtotal: expense.subtotal == null ? null : toNullableDecimal(expense.subtotal),
      tax: expense.tax == null ? null : toNullableDecimal(expense.tax),
      expenseDate: asLegacyDate(expense.expenseDate) ?? now,
      description: normalizeText(expense.description),
      receiptUrl: normalizeText(expense.receiptUrl),
      receiptUploadId: null,
      customerName: normalizeText(expense.customerName),
      paymentMethod: normalizeText(expense.paymentMethod),
      paymentMethodLast4: normalizeText(expense.paymentMethodLast4),
      invoiceNumber: normalizeText(expense.invoiceNumber),
      receiptNumber: normalizeText(expense.receiptNumber),
      taxDeductible: normalizeBoolean(expense.taxDeductible),
      reimbursable: normalizeBoolean(expense.reimbursable),
      reimbursementStatus: normalizeExpenseReimbursementStatus(expense.reimbursementStatus),
      extractedData: parseExpenseExtractedData(expense.extractedData),
      ocrRawText: null,
      ocrStructured: null,
      ocrConfidence: null,
      reviewStatus: normalizeExpenseReviewStatus(expense.reviewStatus ?? expense.status),
      duplicateStatus: normalizeExpenseDuplicateStatus(expense.duplicateStatus),
      duplicateOfExpenseId: null,
      duplicateMatchData: null,
      status: normalizeExpenseStatus(expense.status ?? expense.reviewStatus),
      notes: normalizeText(expense.notes),
      createdAt: asLegacyDate(expense.createdAt) ?? now,
      updatedAt: now,
    };
  }

  private normalizePayment(payment: LegacyPaymentRecord, jobId: number, recordedById: number) {
    const now = asLegacyDate(payment.updatedAt ?? payment.createdAt) ?? new Date();
    return {
      jobId,
      invoiceId: null,
      amount: toDecimal(payment.amount),
      dateReceived: asLegacyDate(payment.dateReceived) ?? now,
      method: normalizePaymentMethod(payment.method),
      status: normalizePaymentStatus(payment.status),
      checkNumber: normalizeText(payment.checkNumber),
      bank: normalizeText(payment.bank),
      memo: normalizeText(payment.memo),
      attachmentUrl: normalizeText(payment.attachmentUrl),
      clearedDate: asLegacyDate(payment.clearedDate),
      recordedById,
      notes: normalizeText(payment.notes),
      createdAt: asLegacyDate(payment.createdAt) ?? now,
      updatedAt: now,
    };
  }

  private normalizeOpportunity(opportunity: LegacyOpportunityRecord, customerId: number, assignedToId: number | null) {
    const now = asLegacyDate(opportunity.updatedAt ?? opportunity.createdAt) ?? new Date();
    return {
      customerId,
      name: normalizeText(opportunity.name) ?? "Imported Opportunity",
      pipeline: normalizeText(opportunity.pipeline)?.toLowerCase() === "not_interested" ? "not_interested" : "sales",
      stage: (normalizeText(opportunity.stage)?.toLowerCase() ?? "new_lead") as any,
      status: (normalizeText(opportunity.status)?.toLowerCase() ?? "open") as any,
      leadValue: opportunity.leadValue == null ? null : toNullableDecimal(opportunity.leadValue),
      source: normalizeText(opportunity.source),
      assignedToId,
      notes: normalizeText(opportunity.notes),
      lastStageChangedAt: asLegacyDate(opportunity.lastStageChangedAt),
      createdAt: asLegacyDate(opportunity.createdAt) ?? now,
      updatedAt: now,
    };
  }

  private normalizeReceipt(receipt: LegacyReceiptRecord, expenseId: number, uploadedById: number) {
    const now = asLegacyDate(receipt.updatedAt ?? receipt.createdAt) ?? new Date();
    return {
      expenseId,
      uploadedById,
      originalFilename: normalizeText(receipt.fileName) ?? "receipt",
      storagePath: normalizeText(receipt.storagePath) ?? buildSyntheticStoragePath("receipt", normalizeLegacyId(receipt.id), receipt.fileName),
      mimeType: normalizeText(receipt.mimeType) ?? "application/octet-stream",
      sizeBytes: 0,
      extractionStatus: "completed" as const,
      extractionRawText: null,
      extractionStructured: null,
      extractionConfidence: null,
      extractionConfidenceByField: null,
      extractionProvider: "legacy-import",
      extractionModel: null,
      manusTaskId: null,
      providerErrorCode: null,
      extractionAttemptCount: 0,
      extractionError: null,
      extractionStartedAt: now,
      extractionCompletedAt: now,
      extractionProcessedAt: now,
      uploadedAt: now,
    };
  }
}

function summaryToDashboardInput(summary: Awaited<ReturnType<typeof buildJobFinancialSummary>>): any {
  return {
    revenueBase: summary.contractValue,
    costs: {
      actualTotalCost: summary.actualTotalCost,
      committedTotalCost: summary.committedTotalCost,
    },
    actualProfit: summary.grossProfit,
    committedProfit: summary.projectedProfit ?? summary.grossProfit,
  };
}
