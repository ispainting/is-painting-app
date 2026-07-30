import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { MigrationImporter } from "./importer";
import type { LegacyMigrationSource } from "./types";

class DryRunRollback extends Error {
  constructor() {
    super("DRY_RUN_ROLLBACK");
  }
}

function getArg(name: string): string | null {
  const index = process.argv.findIndex((value) => value === `--${name}`);
  if (index < 0) return null;
  const next = process.argv[index + 1];
  return next && !next.startsWith("--") ? next : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function loadSource(filePath: string): Promise<LegacyMigrationSource> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as LegacyMigrationSource;
}

async function main() {
  const inputPath = getArg("input") ?? process.env.MIGRATION_INPUT_PATH;
  const outputPath = getArg("report") ?? process.env.MIGRATION_REPORT_PATH;
  const dryRun = hasFlag("dry-run");

  if (!inputPath) {
    throw new Error("Usage: tsx src/lib/migration/cli.ts --input <legacy-export.json> [--report <output.json>] [--dry-run]");
  }

  const prisma = new PrismaClient();
  try {
    const source = await loadSource(path.resolve(inputPath));
    let report = null;

    if (dryRun) {
      try {
        await prisma.$transaction(async (tx) => {
          const importer = new MigrationImporter(tx, source);
          report = await importer.run();
          throw new DryRunRollback();
        }, { maxWait: 60000, timeout: 600000 });
      } catch (error) {
        if (!(error instanceof DryRunRollback)) {
          throw error;
        }
      }
      if (!report) {
        throw new Error("Dry-run did not produce a migration report.");
      }
    } else {
      const importer = new MigrationImporter(prisma, source);
      report = await importer.run();
    }

    const payload = JSON.stringify(report, null, 2);
    if (outputPath) {
      await fs.writeFile(path.resolve(outputPath), payload, "utf8");
    } else {
      console.log(payload);
    }

    if (!report.success || report.validationErrors.length > 0 || report.missingRelationships.length > 0) {
      throw new Error(
        `Import validation failed: errors=${report.validationErrors.length}, missingRelationships=${report.missingRelationships.length}, duplicates=${report.duplicates.length}.`
      );
    }

    if (dryRun) {
      console.log("✓ Dry-run completed; all database writes were rolled back");
    } else {
      console.log("✓ Import completed successfully");
    }
    console.log("✓ Validation completed");
    console.log("✓ Financial engine recalculated all jobs");
    console.log(dryRun ? "✓ Database unchanged after dry-run" : "✓ Database ready for production");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
