"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const ROLE_OPTIONS = [
  { value: "employee", label: "Employee" },
  { value: "admin", label: "Admin" },
] as const;

export default function EmployeesPage() {
  const utils = api.useUtils();
  const [visibility, setVisibility] = useState<"active" | "inactive" | "all">("active");
  const { data, isLoading } = api.employees.list.useQuery({ visibility });
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecord | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", role: "employee" as "admin" | "employee", phone: "", hourlyRate: 0 });
  const [editForm, setEditForm] = useState({ id: 0, name: "", email: "", role: "employee" as "admin" | "employee", phone: "", hourlyRate: 0, isActive: true });

  const create = api.employees.create.useMutation({
    onSuccess: () => {
      toast.success("Employee added");
      utils.employees.list.invalidate();
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", role: "employee", phone: "", hourlyRate: 0 });
    },
    onError: (e) => toast.error(e.message),
  });

  const update = api.employees.update.useMutation({
    onSuccess: () => {
      toast.success("Employee updated");
      utils.employees.list.invalidate();
      setEditOpen(false);
      setSelectedEmployee(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const archive = api.employees.archive.useMutation({
    onSuccess: () => {
      toast.success("Employee archived");
      utils.employees.list.invalidate();
      setConfirmArchiveOpen(false);
      setSelectedEmployee(null);
      setEditOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = (employee: EmployeeRecord) => {
    setSelectedEmployee(employee);
    setEditForm({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      phone: employee.phone || "",
      hourlyRate: Number(employee.hourlyRate ?? 0),
      isActive: employee.isActive,
    });
    setEditOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Employees"
        actions={
          <div className="flex items-center gap-2">
            <select className="input w-auto" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New employee
            </button>
          </div>
        }
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium text-right">Hourly</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : data?.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-slate-500">No employees found.</td></tr>
            ) : (
              data?.map((employee) => (
                <tr key={employee.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{employee.name}</td>
                  <td className="px-4 py-2">{employee.email}</td>
                  <td className="px-4 py-2 capitalize">{employee.role}</td>
                  <td className="px-4 py-2">
                    <span className={`badge ${employee.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
                      {employee.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2">{employee.phone || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {employee.hourlyRate != null ? `$${Number(employee.hourlyRate).toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button className="btn btn-secondary" type="button" onClick={() => openEdit(employee)}>
                        Edit
                      </button>
                      <button
                        className="btn bg-rose-600 text-white hover:bg-rose-700"
                        type="button"
                        onClick={() => {
                          setSelectedEmployee(employee);
                          setConfirmArchiveOpen(true);
                        }}
                      >
                        Archive/Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <ModalShell title="New employee" onClose={() => setCreateOpen(false)}>
          <EmployeeFields
            name={createForm.name}
            email={createForm.email}
            phone={createForm.phone}
            hourlyRate={createForm.hourlyRate}
            role={createForm.role}
            isActive
            password={createForm.password}
            onChange={(next) => setCreateForm((current) => ({ ...current, ...next }))}
            createMode
          />
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={create.isPending || !createForm.email || createForm.password.length < 6}
              onClick={() => create.mutate(createForm)}
            >
              {create.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </ModalShell>
      )}

      {editOpen && selectedEmployee ? (
        <ModalShell title="Edit employee" onClose={() => setEditOpen(false)}>
          <EmployeeFields
            name={editForm.name}
            email={editForm.email}
            phone={editForm.phone}
            hourlyRate={editForm.hourlyRate}
            role={editForm.role}
            isActive={editForm.isActive}
            onChange={(next) => setEditForm((current) => ({ ...current, ...next }))}
          />
          <div className="mt-5 flex justify-between gap-2 border-t border-slate-200 pt-4">
            <button
              className="btn bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => setConfirmArchiveOpen(true)}
            >
              Archive/Delete
            </button>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={update.isPending || !editForm.email}
                onClick={() =>
                  update.mutate({
                    id: editForm.id,
                    data: {
                      name: editForm.name,
                      email: editForm.email,
                      phone: editForm.phone || undefined,
                      role: editForm.role,
                      hourlyRate: editForm.hourlyRate,
                      isActive: editForm.isActive,
                    },
                  })
                }
              >
                {update.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      <ConfirmDialog
        open={confirmArchiveOpen}
        title="Archive Employee"
        message="Do you want to archive this employee? They will be hidden from the active list but time entries and payroll history will remain intact."
        confirmLabel="Archive Employee"
        destructive
        isPending={archive.isPending}
        onCancel={() => setConfirmArchiveOpen(false)}
        onConfirm={() => {
          if (!selectedEmployee) return;
          archive.mutate({ id: selectedEmployee.id });
        }}
      />
    </>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="card w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="text-lg font-semibold">{title}</div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        <div className="border-t border-slate-200 px-6 py-4">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function EmployeeFields({
  name,
  email,
  phone,
  hourlyRate,
  role,
  isActive,
  password,
  onChange,
  createMode = false,
}: {
  name: string;
  email: string;
  phone: string;
  hourlyRate: number;
  role: "admin" | "employee";
  isActive: boolean;
  password?: string;
  onChange: (next: Partial<{ name: string; email: string; phone: string; hourlyRate: number; role: "admin" | "employee"; isActive: boolean; password: string }>) => void;
  createMode?: boolean;
}) {
  return (
    <div className="space-y-3">
      <input className="input" placeholder="Name" value={name} onChange={(e) => onChange({ name: e.target.value })} />
      <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => onChange({ email: e.target.value })} />
      {createMode ? (
        <input className="input" placeholder="Password" type="password" value={password || ""} onChange={(e) => onChange({ password: e.target.value })} />
      ) : null}
      <select className="input" value={role} onChange={(e) => onChange({ role: e.target.value as "admin" | "employee" })}>
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input className="input" placeholder="Phone" value={phone} onChange={(e) => onChange({ phone: e.target.value })} />
      <input className="input" placeholder="Hourly rate" type="number" step="0.01" value={hourlyRate} onChange={(e) => onChange({ hourlyRate: parseFloat(e.target.value) || 0 })} />
      {!createMode ? (
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(e) => onChange({ isActive: e.target.checked })} />
          Active
        </label>
      ) : null}
    </div>
  );
}

type EmployeeRecord = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "employee";
  phone: string | null;
  hourlyRate: any;
  isActive: boolean;
};
