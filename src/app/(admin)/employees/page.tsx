"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { api } from "@/trpc/react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus } from "lucide-react";

type StatusFilter = "active" | "inactive" | "all";

export default function EmployeesPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [visibility, setVisibility] = useState<StatusFilter>("active");
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
    page,
    pageSize: 25,
  });
  const jobs = api.jobs.list.useQuery({ visibility: "active" });

  const create = api.employees.create.useMutation({
    onSuccess: (employee) => {
      toast.success("Employee created");
      utils.employees.list.invalidate();
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
      utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const restore = api.employees.restore.useMutation({
    onSuccess: () => {
      toast.success("Employee restored");
      utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = api.employees.remove.useMutation({
    onSuccess: () => {
      toast.success("Employee deleted");
      utils.employees.list.invalidate();
      setConfirmDelete(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const duplicate = api.employees.duplicate.useMutation({
    onSuccess: (employee) => {
      toast.success("Employee duplicated");
      utils.employees.list.invalidate();
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
      utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkRestore = api.employees.bulkRestore.useMutation({
    onSuccess: () => {
      toast.success("Selected employees restored");
      setSelectedIds([]);
      utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkDelete = api.employees.bulkDelete.useMutation({
    onSuccess: () => {
      toast.success("Selected employees deleted");
      setSelectedIds([]);
      utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkAssignJob = api.employees.bulkAssignJob.useMutation({
    onSuccess: () => {
      toast.success("Assigned selected employees to job");
      setSelectedIds([]);
      setBulkJobId("");
      utils.employees.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = list.data?.rows || [];
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));

  const selectedEmployees = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );

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

  return (
    <>
      <PageHeader
        title="Employees"
        description="Manage workforce records, payroll settings, and assignments"
        actions={
          <div className="flex items-center gap-2">
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Employee
            </button>
          </div>
        }
      />

      <div className="card p-4 mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className="input"
            placeholder="Search name, email, phone, code"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <input
            className="input"
            placeholder="Filter by position"
            value={positionFilter}
            onChange={(event) => {
              setPositionFilter(event.target.value);
              setPage(1);
            }}
          />
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
          <div className="text-sm text-slate-600 flex items-center justify-end">
            {list.data ? `${list.data.total} employees` : ""}
          </div>
        </div>

        {!!selectedIds.length && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="text-sm font-semibold text-slate-700">Bulk Actions ({selectedIds.length} selected)</div>
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
              <button className="btn btn-secondary" onClick={exportSelected}>Export</button>
              <button className="btn btn-secondary" onClick={printSelected}>Print</button>
            </div>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2">
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
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Position</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Active Jobs</th>
              <th className="px-4 py-2 font-medium text-right">Hourly Rate</th>
              <th className="px-4 py-2 font-medium">Hire Date</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr><td colSpan={8} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="text-sm font-semibold text-slate-700">No employees found</div>
                  <div className="mt-1 text-sm text-slate-500">Add your first employee to begin assigning jobs and payroll tracking.</div>
                </td>
              </tr>
            ) : (
              rows.map((employee) => (
                <tr
                  key={employee.id}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => router.push(`/employees/${employee.id}`)}
                >
                  <td className="px-4 py-2" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(employee.id)}
                      onChange={(event) => {
                        setSelectedIds((current) =>
                          event.target.checked
                            ? [...current, employee.id]
                            : current.filter((id) => id !== employee.id)
                        );
                      }}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium text-brand-700">{employee.name}</div>
                    <div className="text-xs text-slate-500">{employee.email}</div>
                  </td>
                  <td className="px-4 py-2">{employee.employeeRole || "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`badge ${employee.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                      {employee.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2">{employee._count.jobAssignments}</td>
                  <td className="px-4 py-2 text-right">${Number(employee.hourlyRate || 0).toFixed(2)}</td>
                  <td className="px-4 py-2">{employee.hireDate ? formatDate(employee.hireDate) : "—"}</td>
                  <td className="px-4 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="inline-flex gap-2">
                      <Link href={`/employees/${employee.id}`} className="btn btn-secondary">Edit</Link>
                      {employee.isActive ? (
                        <button className="btn btn-secondary" onClick={() => archive.mutate({ id: employee.id })}>Archive</button>
                      ) : (
                        <button className="btn btn-secondary" onClick={() => restore.mutate({ id: employee.id })}>Restore</button>
                      )}
                      <button className="btn btn-secondary" onClick={() => setDuplicateTarget({ id: employee.id, name: employee.name })}>Duplicate</button>
                      <button
                        className="btn bg-rose-600 text-white hover:bg-rose-700"
                        onClick={() => setConfirmDelete({ id: employee.id, name: employee.name })}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <div>Page {list.data?.page || 1} of {list.data?.pageCount || 1}</div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" disabled={(list.data?.page || 1) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
          <button className="btn btn-secondary" disabled={(list.data?.page || 1) >= (list.data?.pageCount || 1)} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="text-lg font-semibold mb-3">New Employee</div>
            <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1">
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
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-200">
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
                {create.isPending ? "Creating…" : "Create"}
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
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-md p-6">
            <div className="text-lg font-semibold">Duplicate Employee</div>
            <p className="text-sm text-slate-600 mt-1">Create a copy of {duplicateTarget.name}. Enter a unique login email.</p>
            <div className="mt-3">
              <label className="label">New Email</label>
              <input className="input" value={duplicateEmail} onChange={(event) => setDuplicateEmail(event.target.value)} type="email" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn btn-secondary" onClick={() => { setDuplicateTarget(null); setDuplicateEmail(""); }}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!duplicateEmail || duplicate.isPending}
                onClick={() => duplicate.mutate({ id: duplicateTarget.id, email: duplicateEmail })}
              >
                {duplicate.isPending ? "Duplicating…" : "Duplicate"}
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
