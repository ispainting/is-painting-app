"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { api } from "@/trpc/react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  Archive,
  Briefcase,
  Copy,
  Download,
  Filter,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from "lucide-react";

type StatusFilter = "active" | "inactive" | "all";
type SortBy = "name" | "position" | "status" | "hireDate" | "hourlyRate";
type SortDir = "asc" | "desc";

export default function EmployeesPage() {
  const router = useRouter();
  const utils = api.useUtils();

  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [visibility, setVisibility] = useState<StatusFilter>("active");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkJobId, setBulkJobId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<{ id: number; name: string } | null>(null);
  const [duplicateEmail, setDuplicateEmail] = useState("");

  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee" as "admin" | "employee",
    employeeRole: "",
    phone: "",
    hourlyRate: 0,
    employeeCode: "",
    hireDate: "",
  });

  const list = api.employees.list.useQuery({
    visibility,
    search: search.trim() || undefined,
    position: positionFilter.trim() || undefined,
    sortBy,
    sortDir,
    page,
    pageSize: 25,
  });
  const jobs = api.jobs.list.useQuery({ visibility: "active" });

  const create = api.employees.create.useMutation({
    onSuccess: (employee) => {
      toast.success("Employee created");
      void utils.employees.list.invalidate();
      setCreateOpen(false);
      setCreateForm({
        name: "",
        email: "",
        password: "",
        role: "employee",
        employeeRole: "",
        phone: "",
        hourlyRate: 0,
        employeeCode: "",
        hireDate: "",
      });
      router.push(`/employees/${employee.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const archive = api.employees.archive.useMutation({
    onSuccess: () => {
      toast.success("Employee archived");
      void utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const restore = api.employees.restore.useMutation({
    onSuccess: () => {
      toast.success("Employee restored");
      void utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = api.employees.remove.useMutation({
    onSuccess: () => {
      toast.success("Employee deleted");
      void utils.employees.list.invalidate();
      setConfirmDelete(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const duplicate = api.employees.duplicate.useMutation({
    onSuccess: (employee) => {
      toast.success("Employee duplicated");
      void utils.employees.list.invalidate();
      setDuplicateTarget(null);
      setDuplicateEmail("");
      router.push(`/employees/${employee.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkArchive = api.employees.bulkArchive.useMutation({
    onSuccess: () => {
      toast.success("Selected employees archived");
      setSelectedIds([]);
      void utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkRestore = api.employees.bulkRestore.useMutation({
    onSuccess: () => {
      toast.success("Selected employees restored");
      setSelectedIds([]);
      void utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkDelete = api.employees.bulkDelete.useMutation({
    onSuccess: () => {
      toast.success("Selected employees deleted");
      setSelectedIds([]);
      void utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkAssignJob = api.employees.bulkAssignJob.useMutation({
    onSuccess: () => {
      toast.success("Assigned selected employees to job");
      setSelectedIds([]);
      setBulkJobId("");
      void utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = list.data?.rows || [];
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));

  const selectedEmployees = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );

  const averageRate = useMemo(() => {
    if (!rows.length) return 0;
    const total = rows.reduce((sum, employee) => sum + Number(employee.hourlyRate || 0), 0);
    return total / rows.length;
  }, [rows]);

  const exportSelected = () => {
    if (!selectedEmployees.length) return;
    const headers = ["Name", "Email", "Position", "Status", "Hourly Rate", "Hire Date"];
    const csvRows = selectedEmployees.map((employee) => [
      employee.name,
      employee.email,
      employee.employeeRole || "",
      employee.isActive ? "Active" : "Inactive",
      Number(employee.hourlyRate || 0).toFixed(2),
      employee.hireDate ? formatDate(employee.hireDate) : "",
    ]);

    const csv = [headers, ...csvRows]
      .map((cols) => cols.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "employees-export.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const printSelected = () => {
    if (!selectedEmployees.length) return;
    const html = `
      <html>
        <head><title>Employees Print</title></head>
        <body>
          <h1>Employees</h1>
          <table border="1" cellpadding="6" cellspacing="0">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Position</th><th>Status</th><th>Hourly Rate</th><th>Hire Date</th></tr>
            </thead>
            <tbody>
              ${selectedEmployees
                .map(
                  (employee) =>
                    `<tr><td>${employee.name}</td><td>${employee.email}</td><td>${employee.employeeRole || ""}</td><td>${
                      employee.isActive ? "Active" : "Inactive"
                    }</td><td>$${Number(employee.hourlyRate || 0).toFixed(2)}</td><td>${
                      employee.hireDate ? formatDate(employee.hireDate) : ""
                    }</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const toggleSort = (nextSortBy: SortBy) => {
    if (sortBy === nextSortBy) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(nextSortBy);
      setSortDir(nextSortBy === "hireDate" || nextSortBy === "hourlyRate" ? "desc" : "asc");
    }
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setPositionFilter("");
    setVisibility("active");
    setSortBy("name");
    setSortDir("asc");
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage your workforce, payroll settings, and field assignments"
        actions={
          <div className="flex items-center gap-2">
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New Employee
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Users className="h-4 w-4" />} label="Total" value={String(list.data?.total || 0)} />
        <SummaryCard icon={<Archive className="h-4 w-4" />} label="Active" value={String(list.data?.activeCount || 0)} />
        <SummaryCard icon={<RotateCcw className="h-4 w-4" />} label="Inactive" value={String(list.data?.inactiveCount || 0)} />
        <SummaryCard icon={<Briefcase className="h-4 w-4" />} label="Avg Hourly Rate" value={`$${averageRate.toFixed(2)}`} />
      </div>

      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search name, email, phone, employee ID"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="lg:col-span-3">
            <input
              className="input"
              placeholder="Filter by position"
              value={positionFilter}
              onChange={(event) => {
                setPositionFilter(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="lg:col-span-2">
            <select
              className="input"
              value={visibility}
              onChange={(event) => {
                setVisibility(event.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </div>

          <div className="lg:col-span-3 flex gap-2">
            <button className="btn btn-secondary flex-1" onClick={() => toggleSort(sortBy)}>
              {sortDir === "asc" ? <ArrowUpWideNarrow className="mr-1 h-4 w-4" /> : <ArrowDownWideNarrow className="mr-1 h-4 w-4" />}
              Sort: {sortLabel(sortBy)}
            </button>
            <button className="btn btn-secondary" onClick={clearFilters}>
              <Filter className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2 py-1">Visibility: {visibility}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1">Sort: {sortLabel(sortBy)} ({sortDir})</span>
          <span className="rounded-full bg-slate-100 px-2 py-1">Page {list.data?.page || 1} / {list.data?.pageCount || 1}</span>
        </div>
      </div>

      {!!selectedIds.length && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">Bulk Actions ({selectedIds.length} selected)</div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => bulkArchive.mutate({ ids: selectedIds })}>Archive</button>
            <button className="btn btn-secondary" onClick={() => bulkRestore.mutate({ ids: selectedIds })}>Restore</button>
            <button className="btn bg-rose-600 text-white hover:bg-rose-700" onClick={() => bulkDelete.mutate({ ids: selectedIds })}>Delete</button>
            <select className="input w-56" value={bulkJobId} onChange={(event) => setBulkJobId(event.target.value)}>
              <option value="">Assign to job...</option>
              {jobs.data?.map((job) => (
                <option key={job.id} value={job.id}>{job.name}</option>
              ))}
            </select>
            <button
              className="btn btn-secondary"
              disabled={!bulkJobId}
              onClick={() => bulkAssignJob.mutate({ ids: selectedIds, jobId: Number(bulkJobId) })}
            >
              Assign to Job
            </button>
            <button className="btn btn-secondary" onClick={exportSelected}><Download className="mr-1 h-4 w-4" />Export</button>
            <button className="btn btn-secondary" onClick={printSelected}><Printer className="mr-1 h-4 w-4" />Print</button>
          </div>
        </div>
      )}

      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) {
                        setSelectedIds((current) => current.filter((id) => !rows.some((row) => row.id === id)));
                      } else {
                        setSelectedIds((current) => Array.from(new Set([...current, ...rows.map((row) => row.id)])));
                      }
                    }}
                  />
                </th>
                <SortableHeader title="Name" active={sortBy === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                <SortableHeader title="Position" active={sortBy === "position"} dir={sortDir} onClick={() => toggleSort("position")} />
                <SortableHeader title="Status" active={sortBy === "status"} dir={sortDir} onClick={() => toggleSort("status")} />
                <th className="px-4 py-3 font-medium">Active Jobs</th>
                <SortableHeader title="Hourly Rate" active={sortBy === "hourlyRate"} dir={sortDir} onClick={() => toggleSort("hourlyRate")} right />
                <SortableHeader title="Hire Date" active={sortBy === "hireDate"} dir={sortDir} onClick={() => toggleSort("hireDate")} />
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="border-t border-slate-100 animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-4 rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-40 rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-28 rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-10 rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="ml-auto h-4 w-20 rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-slate-200" /></td>
                    <td className="px-4 py-3"><div className="ml-auto h-8 w-52 rounded bg-slate-200" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-semibold text-slate-700">No employees match these filters</div>
                    <div className="mt-1 text-sm text-slate-500">Try clearing filters or create a new employee profile.</div>
                    <button className="btn btn-secondary mt-4" onClick={clearFilters}>Clear Filters</button>
                  </td>
                </tr>
              ) : (
                rows.map((employee) => (
                  <tr
                    key={employee.id}
                    className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    onClick={() => router.push(`/employees/${employee.id}`)}
                  >
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(employee.id)}
                        onChange={(event) => {
                          setSelectedIds((current) =>
                            event.target.checked ? [...current, employee.id] : current.filter((id) => id !== employee.id)
                          );
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{employee.name}</div>
                      <div className="text-xs text-slate-500">{employee.email}</div>
                    </td>
                    <td className="px-4 py-3">{employee.employeeRole || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${employee.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                        {employee.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{employee._count.jobAssignments}</td>
                    <td className="px-4 py-3 text-right">${Number(employee.hourlyRate || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">{employee.hireDate ? formatDate(employee.hireDate) : "—"}</td>
                    <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="inline-flex gap-1">
                        <Link href={`/employees/${employee.id}`} className="btn btn-secondary">Open</Link>
                        {employee.isActive ? (
                          <button className="btn btn-secondary" onClick={() => archive.mutate({ id: employee.id })}>Archive</button>
                        ) : (
                          <button className="btn btn-secondary" onClick={() => restore.mutate({ id: employee.id })}>Restore</button>
                        )}
                        <button className="btn btn-secondary" onClick={() => setDuplicateTarget({ id: employee.id, name: employee.name })}>
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          className="btn bg-rose-600 text-white hover:bg-rose-700"
                          onClick={() => setConfirmDelete({ id: employee.id, name: employee.name })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {list.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="card h-28 animate-pulse" />)
        ) : rows.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-500">No employees found.</div>
        ) : (
          rows.map((employee) => (
            <div key={employee.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <button className="text-left font-semibold text-slate-900 hover:underline" onClick={() => router.push(`/employees/${employee.id}`)}>
                    {employee.name}
                  </button>
                  <div className="text-xs text-slate-500">{employee.email}</div>
                </div>
                <span className={`badge ${employee.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                  {employee.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>Position: {employee.employeeRole || "—"}</div>
                <div>Jobs: {employee._count.jobAssignments}</div>
                <div>Rate: ${Number(employee.hourlyRate || 0).toFixed(2)}</div>
                <div>Hire: {employee.hireDate ? formatDate(employee.hireDate) : "—"}</div>
              </div>
              <div className="mt-3 flex gap-2">
                <button className="btn btn-secondary" onClick={() => setDuplicateTarget({ id: employee.id, name: employee.name })}>Duplicate</button>
                {employee.isActive ? (
                  <button className="btn btn-secondary" onClick={() => archive.mutate({ id: employee.id })}>Archive</button>
                ) : (
                  <button className="btn btn-secondary" onClick={() => restore.mutate({ id: employee.id })}>Restore</button>
                )}
                <button className="btn bg-rose-600 text-white hover:bg-rose-700" onClick={() => setConfirmDelete({ id: employee.id, name: employee.name })}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <div>Page {list.data?.page || 1} of {list.data?.pageCount || 1}</div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" disabled={(list.data?.page || 1) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
          <button className="btn btn-secondary" disabled={(list.data?.page || 1) >= (list.data?.pageCount || 1)} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="card flex max-h-[90vh] w-full max-w-2xl flex-col p-6">
            <div className="mb-3 text-lg font-semibold">New Employee</div>
            <div className="grid grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
              <Field label="Full Name" value={createForm.name} onChange={(v) => setCreateForm((f) => ({ ...f, name: v }))} />
              <Field label="Email" value={createForm.email} onChange={(v) => setCreateForm((f) => ({ ...f, email: v }))} />
              <Field label="Password" value={createForm.password} onChange={(v) => setCreateForm((f) => ({ ...f, password: v }))} type="password" />
              <div>
                <label className="label">Role</label>
                <select className="input" value={createForm.role} onChange={(event) => setCreateForm((f) => ({ ...f, role: event.target.value as "admin" | "employee" }))}>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Field label="Position" value={createForm.employeeRole} onChange={(v) => setCreateForm((f) => ({ ...f, employeeRole: v }))} />
              <Field label="Phone" value={createForm.phone} onChange={(v) => setCreateForm((f) => ({ ...f, phone: v }))} />
              <Field label="Employee ID" value={createForm.employeeCode} onChange={(v) => setCreateForm((f) => ({ ...f, employeeCode: v }))} />
              <Field label="Hire Date" value={createForm.hireDate} onChange={(v) => setCreateForm((f) => ({ ...f, hireDate: v }))} type="date" />
              <Field
                label="Hourly Rate"
                value={String(createForm.hourlyRate)}
                onChange={(v) => setCreateForm((f) => ({ ...f, hourlyRate: Number(v || 0) }))}
                type="number"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!createForm.name || !createForm.email || createForm.password.length < 6 || create.isPending}
                onClick={() =>
                  create.mutate({
                    name: createForm.name,
                    email: createForm.email,
                    password: createForm.password,
                    role: createForm.role,
                    employeeRole: createForm.employeeRole || undefined,
                    phone: createForm.phone || undefined,
                    hourlyRate: createForm.hourlyRate,
                    employeeCode: createForm.employeeCode || undefined,
                    hireDate: createForm.hireDate ? new Date(createForm.hireDate) : undefined,
                  })
                }
              >
                {create.isPending ? "Creating..." : "Create Employee"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Employee"
        message={`Delete ${confirmDelete?.name || "employee"}? This is permanent and allowed only if no linked records exist.`}
        confirmLabel="Delete"
        destructive
        isPending={remove.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          remove.mutate({ id: confirmDelete.id });
        }}
      />

      {duplicateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="text-lg font-semibold">Duplicate Employee</div>
            <p className="mt-1 text-sm text-slate-600">Create a copy of {duplicateTarget.name}. Enter a unique login email.</p>
            <div className="mt-3">
              <label className="label">New Email</label>
              <input className="input" value={duplicateEmail} onChange={(event) => setDuplicateEmail(event.target.value)} type="email" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => { setDuplicateTarget(null); setDuplicateEmail(""); }}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!duplicateEmail || duplicate.isPending}
                onClick={() => duplicate.mutate({ id: duplicateTarget.id, email: duplicateEmail })}
              >
                {duplicate.isPending ? "Duplicating..." : "Duplicate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} type={type} />
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SortableHeader({
  title,
  active,
  dir,
  onClick,
  right = false,
}: {
  title: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  right?: boolean;
}) {
  return (
    <th className={`px-4 py-3 font-medium ${right ? "text-right" : ""}`}>
      <button className={`inline-flex items-center gap-1 hover:text-slate-900 ${right ? "ml-auto" : ""}`} onClick={onClick}>
        <span>{title}</span>
        {active ? (dir === "asc" ? <ArrowUpWideNarrow className="h-3.5 w-3.5" /> : <ArrowDownWideNarrow className="h-3.5 w-3.5" />) : null}
      </button>
    </th>
  );
}

function sortLabel(value: SortBy) {
  if (value === "name") return "Name";
  if (value === "position") return "Position";
  if (value === "status") return "Status";
  if (value === "hireDate") return "Hire Date";
  return "Hourly Rate";
}
