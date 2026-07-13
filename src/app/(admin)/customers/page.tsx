"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCurrency, formatDate } from "@/lib/utils";
import { api } from "@/trpc/react";
import { Filter, Plus, Search, SlidersHorizontal, Tags, Users } from "lucide-react";
import { toast } from "sonner";

type SortBy = "name" | "createdAt" | "lastContact" | "lifetimeValue" | "openBalance" | "activeJobs" | "proposalCount";
type SortDirection = "asc" | "desc";
type BulkAction = "add_tags" | "remove_tags" | "set_status" | "delete";

type CustomerFormState = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  source: string;
  leadSource: string;
  referralSource: string;
  status: string;
  preferredCommunication: string;
  notes: string;
  tagsText: string;
};

const EMPTY_FORM: CustomerFormState = {
  name: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  source: "",
  leadSource: "",
  referralSource: "",
  status: "Lead",
  preferredCommunication: "",
  notes: "",
  tagsText: "",
};

export default function CustomersPage() {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [leadSourceFilter, setLeadSourceFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [onlyWithOpenBalance, setOnlyWithOpenBalance] = useState(false);
  const [onlyWithActiveJobs, setOnlyWithActiveJobs] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("add_tags");
  const [bulkTags, setBulkTags] = useState("");
  const [bulkStatus, setBulkStatus] = useState("Active");
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<CustomerFormState>(EMPTY_FORM);

  const queryInput = {
    search,
    statuses: statusFilter ? [statusFilter] : undefined,
    tags: tagFilter ? [tagFilter] : undefined,
    leadSources: leadSourceFilter ? [leadSourceFilter] : undefined,
    sortBy,
    sortDirection,
    onlyWithOpenBalance,
    onlyWithActiveJobs,
  } as const;

  const { data, isLoading } = api.customers.list.useQuery(queryInput);

  const create = api.customers.create.useMutation({
    onSuccess: () => {
      toast.success("Customer added");
      setOpen(false);
      setForm(EMPTY_FORM);
      utils.customers.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const update = api.customers.update.useMutation({
    onSuccess: () => {
      toast.success("Customer updated");
      setEditOpen(false);
      setEditingId(null);
      utils.customers.list.invalidate();
      utils.customers.profile.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const bulkUpdate = api.customers.bulkUpdate.useMutation({
    onSuccess: () => {
      toast.success("Customers updated");
      setSelectedIds([]);
      setBulkTags("");
      utils.customers.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = data ?? [];

  const availableStatuses = useMemo(
    () => Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort(),
    [rows],
  );
  const availableLeadSources = useMemo(
    () => Array.from(new Set(rows.map((row) => row.leadSource || row.source).filter(Boolean))).sort(),
    [rows],
  );
  const availableTags = useMemo(
    () => Array.from(new Set(rows.flatMap((row) => row.tags))).sort(),
    [rows],
  );

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.customers += 1;
        acc.lifetimeValue += row.metrics.lifetimeValue;
        acc.openBalance += row.metrics.openBalance;
        acc.activeJobs += row.metrics.activeJobs;
        return acc;
      },
      { customers: 0, lifetimeValue: 0, openBalance: 0, activeJobs: 0 },
    );
  }, [rows]);

  function parseTags(text: string) {
    return Array.from(new Set(text.split(",").map((tag) => tag.trim()).filter(Boolean)));
  }

  function openEdit(customer: any) {
    setEditingId(customer.id);
    setEditForm({
      name: customer.name || "",
      contactName: customer.contactName || "",
      email: customer.email || "",
      phone: customer.phone || "",
      address: customer.address || "",
      city: customer.city || "",
      state: customer.state || "",
      zipCode: customer.zipCode || "",
      source: customer.source || "",
      leadSource: customer.leadSource || "",
      referralSource: customer.referralSource || "",
      status: customer.status || "",
      preferredCommunication: "",
      notes: customer.notes || "",
      tagsText: (customer.tags || []).join(", "),
    });
    setEditOpen(true);
  }

  function toggleSelection(id: number) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function submitCreate() {
    create.mutate({
      name: form.name,
      contactName: form.contactName,
      email: form.email,
      phone: form.phone,
      address: form.address,
      city: form.city,
      state: form.state,
      zipCode: form.zipCode,
      source: form.source,
      leadSource: form.leadSource,
      referralSource: form.referralSource,
      status: form.status,
      preferredCommunication: form.preferredCommunication,
      notes: form.notes,
      tags: parseTags(form.tagsText),
    });
  }

  function submitEdit() {
    if (!editingId) return;
    update.mutate({
      id: editingId,
      data: {
        name: editForm.name,
        contactName: editForm.contactName,
        email: editForm.email,
        phone: editForm.phone,
        address: editForm.address,
        city: editForm.city,
        state: editForm.state,
        zipCode: editForm.zipCode,
        source: editForm.source,
        leadSource: editForm.leadSource,
        referralSource: editForm.referralSource,
        status: editForm.status,
        preferredCommunication: editForm.preferredCommunication,
        notes: editForm.notes,
        tags: parseTags(editForm.tagsText),
      },
    });
  }

  function applyBulkAction() {
    if (!selectedIds.length) return toast.error("Select at least one customer.");
    if ((bulkAction === "add_tags" || bulkAction === "remove_tags") && !parseTags(bulkTags).length) {
      return toast.error("Enter at least one tag.");
    }
    if (bulkAction === "set_status" && !bulkStatus.trim()) {
      return toast.error("Choose a status.");
    }
    bulkUpdate.mutate({
      ids: selectedIds,
      action: bulkAction,
      tags: bulkAction === "add_tags" || bulkAction === "remove_tags" ? parseTags(bulkTags) : undefined,
      status: bulkAction === "set_status" ? bulkStatus : undefined,
    });
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="Lead, client, and account management in one workspace"
        actions={
          <button onClick={() => setOpen(true)} className="btn btn-primary">
            <Plus className="mr-1 h-4 w-4" /> New customer
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard label="Customers" value={String(summary.customers)} icon={<Users className="h-4 w-4" />} />
        <SummaryCard label="Lifetime Value" value={formatCurrency(summary.lifetimeValue)} icon={<Tags className="h-4 w-4" />} />
        <SummaryCard label="Open Balance" value={formatCurrency(summary.openBalance)} icon={<Filter className="h-4 w-4" />} />
        <SummaryCard label="Active Jobs" value={String(summary.activeJobs)} icon={<SlidersHorizontal className="h-4 w-4" />} />
      </div>

      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-6">
          <Field
            label="Advanced Search"
            icon={<Search className="h-4 w-4 text-slate-400" />}
            content={
              <input
                className="input"
                placeholder="Name, contact, phone, email, address, tags"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            }
          />
          <Field
            label="Status"
            content={
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                {availableStatuses.map((status) => (
                  <option key={status} value={status || ""}>{status}</option>
                ))}
              </select>
            }
          />
          <Field
            label="Lead Source"
            content={
              <select className="input" value={leadSourceFilter} onChange={(event) => setLeadSourceFilter(event.target.value)}>
                <option value="">All sources</option>
                {availableLeadSources.map((source) => (
                  <option key={source} value={source || ""}>{source}</option>
                ))}
              </select>
            }
          />
          <Field
            label="Tag"
            content={
              <select className="input" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
                <option value="">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            }
          />
          <Field
            label="Sort"
            content={
              <div className="grid grid-cols-2 gap-2">
                <select className="input" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
                  <option value="createdAt">Newest</option>
                  <option value="name">Name</option>
                  <option value="lastContact">Last Contact</option>
                  <option value="lifetimeValue">Lifetime Value</option>
                  <option value="openBalance">Open Balance</option>
                  <option value="activeJobs">Active Jobs</option>
                  <option value="proposalCount">Proposal Count</option>
                </select>
                <select className="input" value={sortDirection} onChange={(event) => setSortDirection(event.target.value as SortDirection)}>
                  <option value="desc">Desc</option>
                  <option value="asc">Asc</option>
                </select>
              </div>
            }
          />
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick Filters</div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={onlyWithOpenBalance} onChange={(event) => setOnlyWithOpenBalance(event.target.checked)} />
              Open balance only
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={onlyWithActiveJobs} onChange={(event) => setOnlyWithActiveJobs(event.target.checked)} />
              Active jobs only
            </label>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Bulk actions</div>
            <div className="text-sm text-slate-500">Apply status or tag changes to multiple customers at once.</div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4 lg:w-[760px]">
            <select className="input" value={bulkAction} onChange={(event) => setBulkAction(event.target.value as BulkAction)}>
              <option value="add_tags">Add tags</option>
              <option value="remove_tags">Remove tags</option>
              <option value="set_status">Set status</option>
              <option value="delete">Archive</option>
            </select>
            <input
              className="input"
              placeholder="Tags, comma separated"
              value={bulkTags}
              onChange={(event) => setBulkTags(event.target.value)}
              disabled={bulkAction === "set_status" || bulkAction === "delete"}
            />
            <input
              className="input"
              placeholder="Status"
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value)}
              disabled={bulkAction !== "set_status"}
            />
            <button className="btn btn-primary" onClick={applyBulkAction} disabled={bulkUpdate.isPending || !selectedIds.length}>
              {bulkUpdate.isPending ? "Applying…" : `Apply to ${selectedIds.length || 0}`}
            </button>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedIds.length === rows.length}
                    onChange={(event) => setSelectedIds(event.target.checked ? rows.map((row) => row.id) : [])}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Lead Source</th>
                <th className="px-4 py-3 font-medium">Lifetime Value</th>
                <th className="px-4 py-3 font-medium">Last Contact</th>
                <th className="px-4 py-3 font-medium">Open Balance</th>
                <th className="px-4 py-3 font-medium">Active Jobs</th>
                <th className="px-4 py-3 font-medium">Proposals</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-slate-500">Loading customers…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center">
                    <div className="text-sm font-semibold text-slate-700">No customers match these filters</div>
                    <div className="mt-1 text-sm text-slate-500">Adjust the search, clear filters, or add a new customer.</div>
                    <button className="btn btn-primary mt-3" onClick={() => setOpen(true)}>Add Customer</button>
                  </td>
                </tr>
              ) : (
                rows.map((customer) => (
                  <tr key={customer.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 align-top">
                      <input type="checkbox" checked={selectedIds.includes(customer.id)} onChange={() => toggleSelection(customer.id)} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link href={`/customers/${customer.id}`} className="font-medium text-brand-700 hover:underline">
                        {customer.name}
                      </Link>
                      <div className="mt-1 text-xs text-slate-500">{customer.contactName || customer.email || customer.phone || "No primary contact set"}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {customer.tags.length ? customer.tags.map((tag) => (
                          <span key={tag} className="badge bg-slate-100 text-slate-700">{tag}</span>
                        )) : <span className="text-xs text-slate-400">No tags</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">{customer.status || "—"}</td>
                    <td className="px-4 py-3 align-top">{customer.leadSource || customer.source || "—"}</td>
                    <td className="px-4 py-3 align-top">{formatCurrency(customer.metrics.lifetimeValue)}</td>
                    <td className="px-4 py-3 align-top">{formatDate(customer.lastContactAt)}</td>
                    <td className="px-4 py-3 align-top">{formatCurrency(customer.metrics.openBalance)}</td>
                    <td className="px-4 py-3 align-top">{customer.metrics.activeJobs}</td>
                    <td className="px-4 py-3 align-top">{customer.metrics.proposalCount}</td>
                    <td className="px-4 py-3 text-right align-top">
                      <div className="inline-flex items-center gap-2">
                        <Link href={`/customers/${customer.id}`} className="btn btn-secondary text-xs">Open</Link>
                        <button className="btn btn-secondary text-xs" onClick={() => openEdit(customer)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open ? (
        <CustomerEditorModal
          title="New customer"
          form={form}
          onChange={setForm}
          onClose={() => setOpen(false)}
          onSubmit={submitCreate}
          pending={create.isPending}
        />
      ) : null}

      {editOpen ? (
        <CustomerEditorModal
          title="Edit customer"
          form={editForm}
          onChange={setEditForm}
          onClose={() => setEditOpen(false)}
          onSubmit={submitEdit}
          pending={update.isPending}
        />
      ) : null}
    </>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="rounded-full bg-slate-100 p-2 text-slate-600">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Field({ label, content, icon }: { label: string; content: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      {content}
    </div>
  );
}

function CustomerEditorModal({
  title,
  form,
  onChange,
  onClose,
  onSubmit,
  pending,
}: {
  title: string;
  form: CustomerFormState;
  onChange: (next: CustomerFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="card flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <div className="text-lg font-semibold text-slate-900">{title}</div>
        </div>
        <div className="grid grid-cols-1 gap-4 overflow-y-auto px-6 py-5 md:grid-cols-2">
          <Input label="Customer Name" value={form.name} onChange={(value) => onChange({ ...form, name: value })} />
          <Input label="Primary Contact" value={form.contactName} onChange={(value) => onChange({ ...form, contactName: value })} />
          <Input label="Email" value={form.email} onChange={(value) => onChange({ ...form, email: value })} />
          <Input label="Phone" value={form.phone} onChange={(value) => onChange({ ...form, phone: value })} />
          <Input label="Street / Address" value={form.address} onChange={(value) => onChange({ ...form, address: value })} />
          <Input label="City" value={form.city} onChange={(value) => onChange({ ...form, city: value })} />
          <Input label="State" value={form.state} onChange={(value) => onChange({ ...form, state: value })} />
          <Input label="Zip Code" value={form.zipCode} onChange={(value) => onChange({ ...form, zipCode: value })} />
          <Input label="Source" value={form.source} onChange={(value) => onChange({ ...form, source: value })} />
          <Input label="Lead Source" value={form.leadSource} onChange={(value) => onChange({ ...form, leadSource: value })} />
          <Input label="Referral Source" value={form.referralSource} onChange={(value) => onChange({ ...form, referralSource: value })} />
          <Input label="Preferred Communication" value={form.preferredCommunication} onChange={(value) => onChange({ ...form, preferredCommunication: value })} />
          <Input label="Status" value={form.status} onChange={(value) => onChange({ ...form, status: value })} />
          <Input label="Tags" value={form.tagsText} onChange={(value) => onChange({ ...form, tagsText: value })} placeholder="vip, repeat, warranty" />
          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input min-h-[120px]" value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSubmit} disabled={pending || !form.name.trim()}>
            {pending ? "Saving…" : "Save customer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}
