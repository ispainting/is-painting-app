import { describe, expect, it } from "vitest";
import { buildJobsListWhere, buildJobsListInputForPageFilter, JOB_STATUS_VALUES, JOBS_PAGE_FILTERS } from "./job-filters";

describe("buildJobsListWhere", () => {
  it("Active never includes Sent or Estimate: exact status filter narrows to one status", () => {
    const where = buildJobsListWhere({ status: "active", visibility: "active" }, { isEmployee: false });
    expect(where.status).toBe("active");
    expect(where.status).not.toBe("sent");
    expect(where.status).not.toBe("estimate");
    expect(where.deletedAt).toBeNull();
  });

  it("All excludes archived jobs", () => {
    const where = buildJobsListWhere({ visibility: "all" }, { isEmployee: false });
    expect(where.status).toBeUndefined();
    expect(where.deletedAt).toBeUndefined();
  });

  it("Archived includes only deletedAt != null", () => {
    const where = buildJobsListWhere({ visibility: "archived" }, { isEmployee: false });
    expect(where.deletedAt).toEqual({ not: null });
    expect(where.status).toBeUndefined();
  });

  it("defaults to active visibility (deletedAt null) when no input is given", () => {
    const where = buildJobsListWhere(undefined, { isEmployee: false });
    expect(where.deletedAt).toBeNull();
  });

  it("restricts employee users to only their assigned jobs", () => {
    const where = buildJobsListWhere({ visibility: "all" }, { isEmployee: true, employeeUserId: 42 });
    expect(where.assignments).toEqual({ some: { userId: 42 } });
  });

  it("does not restrict admin users by assignment", () => {
    const where = buildJobsListWhere({ visibility: "all" }, { isEmployee: false });
    expect(where.assignments).toBeUndefined();
  });
});

describe("buildJobsListInputForPageFilter", () => {
  it("maps every status chip to its exact enum value with non-archived visibility", () => {
    for (const status of JOB_STATUS_VALUES) {
      expect(buildJobsListInputForPageFilter(status)).toEqual({ status, visibility: "active" });
    }
  });

  it("maps the All chip to non-archived visibility with no status filter", () => {
    expect(buildJobsListInputForPageFilter("all")).toEqual({ visibility: "all" });
  });

  it("maps the Archived chip to archived visibility with no status filter", () => {
    expect(buildJobsListInputForPageFilter("archived")).toEqual({ visibility: "archived" });
  });

  it("includes exactly the 7 statuses plus all and archived, with no duplicates", () => {
    expect(JOBS_PAGE_FILTERS).toHaveLength(9);
    expect(new Set(JOBS_PAGE_FILTERS).size).toBe(9);
  });
});
