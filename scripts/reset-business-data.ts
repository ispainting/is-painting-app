import fs from "node:fs/promises";
import { URL } from "node:url";
import { PrismaClient } from "@prisma/client";

const DEFAULT_OUTPUT_PATH = "data/reset-report.json";
const DEFAULT_BACKUP_MANIFEST_PATH = "data/neon-backup.preview.verified.json";
const REQUIRED_PREVIEW_TARGET = {
  host: "ep-dark-glitter-aj75jjtu-pooler.c-3.us-east-2.aws.neon.tech",
  database: "neondb",
  environment: "preview",
};
const REQUIRED_PRESERVED_ADMIN = {
  id: 1,
  email: "admin@ispainting.com",
  name: "Italo Santos",
};

const PLAN: Array<{ group: string; tables: string[] }> = [
  {
    group: "Leaf records",
    tables: [
      "ExpenseLineItem",
      "ExpenseAttachment",
      "ExpenseReceiptUpload",
      "InvoiceLineItem",
      "ProposalAttachment",
      "ProposalOption",
      "ProposalSection",
      "ProposalPaintColor",
      "JobPaintColor",
      "JobMaterial",
      "JobLabor",
      "ReviewSubmission",
      "AutomationRun",
      "CustomerTouchpoint",
      "CustomerFile",
      "EmployeeNote",
      "EmployeeActivity",
      "EmployeeCertification",
      "EmployeeDocument",
      "EmployeeJobAssignment",
    ],
  },
  {
    group: "Transactional records",
    tables: [
      "TimeEntry",
      "Expense",
      "Payment",
      "Invoice",
      "Opportunity",
      "Proposal",
    ],
  },
  {
    group: "Parent records",
    tables: ["Job", "Customer"],
  },
  {
    group: "Supporting records",
    tables: ["InventoryItem", "AuditLog", "MigrationMap"],
  },
];

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run") || !argv.includes("--confirm-reset"),
    confirmReset: argv.includes("--confirm-reset"),
    confirmProduction: argv.includes("--confirm-production"),
    backupRef: readFlagValue(argv, "--backup-ref"),
    backupManifestPath: readFlagValue(argv, "--backup-manifest") ?? DEFAULT_BACKUP_MANIFEST_PATH,
    reportPath: readFlagValue(argv, "--report") ?? DEFAULT_OUTPUT_PATH,
  };
}

type BackupManifest = {
  verified: boolean;
  neonProject: string;
  sourceBranch: string;
  sourceDatabaseHost: string;
  backupBranch: {
    id: string;
    name: string;
  };
  createdAt: string;
  restoreProcedure: string[];
};

function readFlagValue(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0) return null;
  const next = argv[index + 1];
  return next && !next.startsWith("--") ? next : null;
}

function parseDatabaseUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  return {
    host: url.host,
    database: url.pathname.replace(/^\//, ""),
  };
}

function environmentName() {
  return process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";
}

function isProductionEnvironment() {
  return [process.env.APP_ENV, process.env.VERCEL_ENV, process.env.NODE_ENV].some((value) => value === "production");
}

function matchesRequiredPreviewTarget(target: { host: string; database: string; environment: string }) {
  return (
    target.host === REQUIRED_PREVIEW_TARGET.host &&
    target.database === REQUIRED_PREVIEW_TARGET.database &&
    target.environment === REQUIRED_PREVIEW_TARGET.environment
  );
}

async function tableExists(prisma: PrismaClient, tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    `public."${tableName}"`
  );
  return Boolean(rows[0]?.exists);
}

async function countTable(prisma: PrismaClient, tableName: string): Promise<number | null> {
  if (!(await tableExists(prisma, tableName))) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM "${tableName}"`);
  return Number(rows[0]?.count ?? 0);
}

async function listUsers(prisma: PrismaClient) {
  return prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { id: "asc" },
  });
}

function selectPreservedAdmin(users: Array<{ id: number; email: string; name: string; role: string; isActive: boolean }>) {
  const exactMatch = users.find(
    (user) =>
      user.id === REQUIRED_PRESERVED_ADMIN.id &&
      user.email.toLowerCase() === REQUIRED_PRESERVED_ADMIN.email &&
      user.name === REQUIRED_PRESERVED_ADMIN.name
  );

  if (!exactMatch) {
    throw new Error(
      `Required preserved administrator not found. Expected id=${REQUIRED_PRESERVED_ADMIN.id}, email=${REQUIRED_PRESERVED_ADMIN.email}, name=\"${REQUIRED_PRESERVED_ADMIN.name}\".`
    );
  }

  if (exactMatch.role !== "admin") {
    throw new Error(`Required preserved administrator ${exactMatch.email} is not role=admin.`);
  }

  if (!exactMatch.isActive) {
    throw new Error(`Required preserved administrator ${exactMatch.email} is inactive.`);
  }

  return exactMatch;
}

async function collectCounts(prisma: PrismaClient) {
  const counts: Record<string, number | null> = {};
  for (const { tables } of PLAN) {
    for (const table of tables) {
      counts[table] = await countTable(prisma, table);
    }
  }
  counts.User = await countTable(prisma, "User");
  counts.Config = await countTable(prisma, "Config");
  counts.AutomationTemplate = await countTable(prisma, "AutomationTemplate");
  counts.AutomationStep = await countTable(prisma, "AutomationStep");
  return counts;
}

function buildPlanSummary(countsBefore: Record<string, number | null>) {
  return PLAN.map(({ group, tables }) => ({
    group,
    tables: tables.map((table) => ({
      table,
      countBefore: countsBefore[table],
    })),
  }));
}

function flattenBusinessTables() {
  return PLAN.flatMap(({ tables }) => tables);
}

async function writeReport(reportPath: string, report: unknown) {
  await fs.mkdir(new URL(".", `file://${process.cwd()}/${reportPath}`).pathname, { recursive: true }).catch(() => undefined);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function loadBackupManifest(path: string): Promise<BackupManifest | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<BackupManifest>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.verified !== true) return null;
    if (!parsed.neonProject || !parsed.sourceBranch || !parsed.sourceDatabaseHost) return null;
    if (!parsed.backupBranch?.id || !parsed.backupBranch?.name) return null;
    if (!parsed.createdAt || !Array.isArray(parsed.restoreProcedure) || parsed.restoreProcedure.length === 0) return null;
    return parsed as BackupManifest;
  } catch {
    return null;
  }
}

function validateBackupReference(
  backupRef: string | null,
  backupManifest: BackupManifest | null,
  targetHost: string
): { ok: boolean; reason: string | null } {
  if (!backupRef) {
    return { ok: false, reason: "No backup reference provided." };
  }
  if (!backupManifest) {
    return {
      ok: false,
      reason:
        "Backup manifest is missing or invalid. Provide --backup-manifest pointing to a verified Neon backup metadata file.",
    };
  }
  if (backupManifest.backupBranch.id !== backupRef) {
    return {
      ok: false,
      reason: `Backup reference mismatch. Expected verified backup branch id ${backupManifest.backupBranch.id}.`,
    };
  }
  if (backupManifest.sourceDatabaseHost !== targetHost) {
    return {
      ok: false,
      reason:
        `Backup source host mismatch. Verified backup host is ${backupManifest.sourceDatabaseHost}, current target host is ${targetHost}.`,
    };
  }
  return { ok: true, reason: null };
}

async function schemaPreflight(prisma: PrismaClient) {
  const migrationMapExists = await tableExists(prisma, "MigrationMap");
  return {
    migrationMapExists,
    readyForReset: migrationMapExists,
  };
}

function buildBackupMetadata(args: ReturnType<typeof parseArgs>, backupManifest: BackupManifest | null) {
  if (!args.backupRef || !backupManifest) return null;
  return {
    reference: args.backupRef,
    manifestPath: args.backupManifestPath,
    verifiedAt: new Date().toISOString(),
    neonProject: backupManifest.neonProject,
    sourceBranch: backupManifest.sourceBranch,
    sourceDatabaseHost: backupManifest.sourceDatabaseHost,
    backupBranch: backupManifest.backupBranch,
    createdAt: backupManifest.createdAt,
    restoreProcedure: backupManifest.restoreProcedure,
    rollbackViable: true,
    source: "verified-manifest",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const envName = environmentName();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  if (isProductionEnvironment() && !args.confirmProduction) {
    throw new Error("Refusing to target Production without --confirm-production.");
  }

  if (!args.confirmReset) {
    args.dryRun = true;
  }

  const { host, database } = parseDatabaseUrl(databaseUrl);
  const target = { host, database, environment: envName };
  const prisma = new PrismaClient();
  const backupManifest = await loadBackupManifest(args.backupManifestPath);
  const backupValidation = validateBackupReference(args.backupRef, backupManifest, host);

  if (args.confirmReset && !matchesRequiredPreviewTarget(target)) {
    throw new Error(
      `Refusing destructive reset: target must be host=${REQUIRED_PREVIEW_TARGET.host}, db=${REQUIRED_PREVIEW_TARGET.database}, env=${REQUIRED_PREVIEW_TARGET.environment}. ` +
        `Received host=${host}, db=${database}, env=${envName}.`
    );
  }

  if (args.confirmReset && !backupValidation.ok) {
    throw new Error(
      `Refusing destructive reset without verified backup reference: ${backupValidation.reason}`
    );
  }

  try {
    const schemaCheck = await schemaPreflight(prisma);

    const users = await listUsers(prisma);
    const preservedAdmin = selectPreservedAdmin(users);
    const countsBefore = await collectCounts(prisma);
    const plan = buildPlanSummary(countsBefore);
    const backup = buildBackupMetadata(args, backupManifest);

    const dryRunReport = {
      mode: args.confirmReset ? "confirm-reset" : "dry-run",
      environment: envName,
      databaseHost: host,
      databaseName: database,
      requiredResetTarget: REQUIRED_PREVIEW_TARGET,
      preservedAdministrator: preservedAdmin,
      requiredPreservedAdministrator: REQUIRED_PRESERVED_ADMIN,
      usersFound: users,
      schemaCheck,
      deletionPlan: plan,
      tablesToClear: flattenBusinessTables(),
      preservedTables: ["Config", "AutomationTemplate", "AutomationStep"],
      countsBefore,
      countsAfter: null,
      backup,
      backupValidation,
      commandRequiredForReset: isProductionEnvironment()
        ? "npm run db:reset-business-data -- --confirm-reset --confirm-production --backup-ref <verified-backup-branch-id> --backup-manifest data/neon-backup.preview.verified.json"
        : "npm run db:reset-business-data -- --confirm-reset --backup-ref <verified-backup-branch-id> --backup-manifest data/neon-backup.preview.verified.json",
      warnings: [
        isProductionEnvironment()
          ? "Production target requires --confirm-production in addition to --confirm-reset."
          : null,
        !matchesRequiredPreviewTarget(target)
          ? `Current target differs from approved preview target: expected host=${REQUIRED_PREVIEW_TARGET.host}, db=${REQUIRED_PREVIEW_TARGET.database}, env=${REQUIRED_PREVIEW_TARGET.environment}.`
          : null,
        !backupValidation.ok
          ? `Backup verification not satisfied: ${backupValidation.reason}`
          : null,
        !schemaCheck.readyForReset
          ? "Required schema preflight failed: MigrationMap table is missing. Apply/baseline migrations before destructive reset."
          : null,
      ].filter((value): value is string => Boolean(value)),
      errors: [] as string[],
      deletionExecuted: false,
      verification: null,
    };

    console.log(`database host: ${host}`);
    console.log(`database name: ${database}`);
    console.log(`environment: ${envName}`);
    console.log(`preserved administrator: ${preservedAdmin.id} ${preservedAdmin.email} (${preservedAdmin.name})`);
    console.log(JSON.stringify(dryRunReport, null, 2));

    if (args.dryRun) {
      await writeReport(args.reportPath, dryRunReport);
      return;
    }

    if (!schemaCheck.readyForReset) {
      throw new Error("Refusing destructive reset because schema preflight failed: MigrationMap table does not exist.");
    }

    const existingBusinessTables: string[] = [];
    for (const table of flattenBusinessTables()) {
      if (await tableExists(prisma, table)) existingBusinessTables.push(table);
    }

    await prisma.$transaction(async (tx) => {
      if (existingBusinessTables.length > 0) {
        const tableList = existingBusinessTables.map((table) => `"${table}"`).join(", ");
        await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
      }

      await tx.user.deleteMany({ where: { id: { not: preservedAdmin.id } } });

      await tx.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE((SELECT MAX(id) FROM "User"), 1), true)`
      );
    });

    const countsAfter = await collectCounts(prisma);
    const remainingUsers = await listUsers(prisma);
    const verification = {
      customers: countsAfter.Customer ?? 0,
      jobs: countsAfter.Job ?? 0,
      employeesExcludingAdmin: Math.max(0, (countsAfter.User ?? 0) - 1),
      timeEntries: countsAfter.TimeEntry ?? 0,
      expenses: countsAfter.Expense ?? 0,
      payments: countsAfter.Payment ?? 0,
      opportunities: countsAfter.Opportunity ?? 0,
      receipts: countsAfter.ExpenseAttachment ?? 0,
      estimates: countsAfter.Proposal ?? 0,
      invoices: countsAfter.Invoice ?? 0,
      jobMaterials: countsAfter.JobMaterial ?? 0,
      jobLabor: countsAfter.JobLabor ?? 0,
      migrationMappings: countsAfter.MigrationMap ?? 0,
      configRows: countsAfter.Config ?? 0,
      automationTemplates: countsAfter.AutomationTemplate ?? 0,
      automationSteps: countsAfter.AutomationStep ?? 0,
      remainingUsers,
      preservedConfigIntact: countsBefore.Config === countsAfter.Config,
      preservedAutomationIntact:
        countsBefore.AutomationTemplate === countsAfter.AutomationTemplate &&
        countsBefore.AutomationStep === countsAfter.AutomationStep,
    };

    const report = {
      ...dryRunReport,
      deletionExecuted: true,
      countsAfter,
      verification,
      success:
        (countsAfter.Customer ?? 0) === 0 &&
        (countsAfter.Job ?? 0) === 0 &&
        Math.max(0, (countsAfter.User ?? 0) - 1) === 0 &&
        remainingUsers.length === 1 &&
        remainingUsers[0]?.id === REQUIRED_PRESERVED_ADMIN.id &&
        remainingUsers[0]?.email.toLowerCase() === REQUIRED_PRESERVED_ADMIN.email &&
        remainingUsers[0]?.name === REQUIRED_PRESERVED_ADMIN.name &&
        (countsAfter.TimeEntry ?? 0) === 0 &&
        (countsAfter.Expense ?? 0) === 0 &&
        (countsAfter.Payment ?? 0) === 0 &&
        (countsAfter.Opportunity ?? 0) === 0 &&
        (countsAfter.ExpenseAttachment ?? 0) === 0 &&
        (countsAfter.Proposal ?? 0) === 0 &&
        (countsAfter.Invoice ?? 0) === 0 &&
        (countsAfter.JobMaterial ?? 0) === 0 &&
        (countsAfter.JobLabor ?? 0) === 0 &&
        (countsAfter.MigrationMap ?? 0) === 0 &&
        verification.preservedConfigIntact &&
        verification.preservedAutomationIntact,
    };

    await writeReport(args.reportPath, report);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
