import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { opportunitiesRouter } from "./opportunities";

const adminSession = { userId: 1, role: "admin" as const, email: "admin@example.test", name: "Admin" };
const callerWith = (prisma: Record<string, unknown>) =>
  opportunitiesRouter.createCaller({ prisma: prisma as never, session: adminSession });

describe("Opportunity stage-history deletion behavior", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    join(process.cwd(), "prisma/migrations/20261020210000_opportunity_reconciliation/migration.sql"),
    "utf8"
  );

  it("declares history as an Opportunity child with cascading deletion", () => {
    expect(schema).toMatch(/opportunity\s+Opportunity\s+@relation\(fields:\s*\[opportunityId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/);
    expect(migration).toMatch(/OpportunityStageHistory_opportunityId_fkey[\s\S]*?REFERENCES "Opportunity"\("id"\) ON DELETE CASCADE/);
    expect(schema).toMatch(/opportunityId\s+Int\s*\n/);
  });

  it("keeps a nullable author and sets the author reference null when a User is deleted", () => {
    expect(schema).toMatch(/changedById\s+Int\?/);
    expect(schema).toMatch(/changedBy\s+User\?\s+@relation\(fields:\s*\[changedById\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/);
    expect(migration).toMatch(/OpportunityStageHistory_changedById_fkey[\s\S]*?REFERENCES "User"\("id"\) ON DELETE SET NULL/);
  });

  it("archives without deleting or mutating stage history", async () => {
    const opportunity = { update: vi.fn().mockResolvedValue({ id: 10, archivedAt: new Date() }) };
    const history = { deleteMany: vi.fn() };
    const result = await callerWith({ opportunity, opportunityStageHistory: history }).setArchived({ id: 10, archived: true });
    expect(result.archivedAt).toBeInstanceOf(Date);
    expect(opportunity.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 10 },
      data: { archivedAt: expect.any(Date) },
    });
    expect(history.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only the selected disposable Opportunity, leaving dependent-row removal to its FK cascade", async () => {
    const opportunity = {
      findUnique: vi.fn().mockResolvedValue({
        id: 10,
        name: "Disposable",
        customer: { name: "Customer" },
        job: null,
        _count: { proposals: 0, automationRuns: 0 },
      }),
      delete: vi.fn().mockResolvedValue({ id: 10 }),
    };
    const result = await callerWith({ opportunity }).remove({ id: 10 });
    expect(result).toEqual({ ok: true });
    expect(opportunity.delete).toHaveBeenCalledExactlyOnceWith({ where: { id: 10 } });
  });
});
