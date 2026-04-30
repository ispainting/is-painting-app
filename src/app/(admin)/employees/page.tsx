"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function EmployeesPage() {
  const utils = api.useUtils();
  const { data, isLoading } = api.employees.list.useQuery();
  const create = api.employees.create.useMutation({
    onSuccess: () => {
      toast.success("Employee added");
      utils.employees.list.invalidate();
      setOpen(false);
      setForm({ name: "", email: "", password: "", role: "employee", phone: "", hourlyRate: 0 });
    },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", password: "", role: "employee" as "admin" | "employee",
    phone: "", hourlyRate: 0,
  });

  return (
    <>
      <PageHeader
        title="Employees"
        actions={
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New employee
          </button>
        }
      />
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium text-right">Hourly</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            ) : (
              data?.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2 capitalize">{u.role}</td>
                  <td className="px-4 py-2">{u.phone || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {u.hourlyRate ? `$${Number(u.hourlyRate).toFixed(2)}` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6">
            <div className="text-lg font-semibold mb-3">New employee</div>
            <div className="space-y-3">
              <input className="input" placeholder="Name" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="input" placeholder="Email" type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <input className="input" placeholder="Password" type="password" value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
              <select className="input" value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as any }))}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
              </select>
              <input className="input" placeholder="Phone" value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              <input className="input" placeholder="Hourly rate" type="number" step="0.01" value={form.hourlyRate}
                onChange={(e) => setForm((f) => ({ ...f, hourlyRate: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={create.isPending || !form.email || form.password.length < 6}
                onClick={() => create.mutate(form)}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
