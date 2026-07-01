"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatDateTime } from "@/lib/utils";
import { Eye, Plus, Copy, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "interior_painting", label: "Interior Painting" },
  { value: "exterior_painting", label: "Exterior Painting" },
  { value: "deck_restoration", label: "Deck Restoration" },
  { value: "pergola_restoration", label: "Pergola Restoration" },
  { value: "trim_restoration", label: "Trim Restoration" },
  { value: "cabinet_refinishing", label: "Cabinet Refinishing" },
  { value: "wallpaper_removal", label: "Wallpaper Removal" },
  { value: "drywall_repair", label: "Drywall Repair" },
  { value: "commercial_painting", label: "Commercial Painting" },
  { value: "new_construction", label: "New Construction" },
  { value: "property_maintenance", label: "Property Maintenance" },
  { value: "custom", label: "Custom" },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(CATEGORY_OPTIONS.map((option) => [option.value, option.label]));
type ProposalCategoryValue = Exclude<(typeof CATEGORY_OPTIONS)[number]["value"], "">;

type ProposalExampleRecord = {
  id: number;
  title: string;
  proposalCategory: ProposalCategoryValue;
  proposalType: "residential" | "commercial" | "restoration" | "maintenance" | "new_construction" | "custom" | null;
  description: string | null;
  fullProposalContent: string;
  tags: string[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export default function ProposalLibraryPage() {
  const utils = api.useUtils();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    proposalCategory: "interior_painting" as ProposalCategoryValue,
    proposalType: "residential" as "residential" | "commercial" | "restoration" | "maintenance" | "new_construction" | "custom",
    description: "",
    fullProposalContent: "",
    tagsText: "",
    notes: "",
  });

  const listQuery = api.proposalExamples.list.useQuery({
    search: search.trim() || undefined,
    proposalCategory: category || undefined,
  });

  const selectedExample = listQuery.data?.find((example) => example.id === viewingId) || null;

  const resetForm = () => {
    setForm({
      title: "",
      proposalCategory: "interior_painting",
      proposalType: "residential",
      description: "",
      fullProposalContent: "",
      tagsText: "",
      notes: "",
    });
  };

  const openCreate = () => {
    resetForm();
    setEditingId(null);
    setOpen(true);
  };

  const openEdit = (example: ProposalExampleRecord) => {
    setEditingId(example.id);
    setForm({
      title: example.title,
      proposalCategory: example.proposalCategory,
      proposalType: example.proposalType || "residential",
      description: example.description || "",
      fullProposalContent: example.fullProposalContent,
      tagsText: example.tags.join(", "),
      notes: example.notes || "",
    });
    setOpen(true);
  };

  const create = api.proposalExamples.create.useMutation({
    onSuccess: () => {
      toast.success("Proposal example added");
      utils.proposalExamples.list.invalidate();
      setOpen(false);
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const update = api.proposalExamples.update.useMutation({
    onSuccess: () => {
      toast.success("Proposal example updated");
      utils.proposalExamples.list.invalidate();
      setOpen(false);
      setEditingId(null);
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = api.proposalExamples.remove.useMutation({
    onSuccess: () => {
      toast.success("Proposal example deleted");
      utils.proposalExamples.list.invalidate();
      if (viewingId) setViewingId(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const duplicate = api.proposalExamples.duplicate.useMutation({
    onSuccess: () => {
      toast.success("Proposal example duplicated");
      utils.proposalExamples.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const save = () => {
    const payload = {
      title: form.title,
      proposalCategory: form.proposalCategory,
      proposalType: form.proposalType,
      description: form.description,
      fullProposalContent: form.fullProposalContent,
      tags: form.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
      notes: form.notes,
    };

    if (editingId) {
      update.mutate({ id: editingId, data: payload });
      return;
    }

    create.mutate(payload);
  };

  return (
    <>
      <PageHeader
        title="Proposal Library"
        description="A growing library of real I.S. Painting proposals and examples."
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1" /> New Example
          </button>
        }
      />

      <div className="card p-4 mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-md w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="input pl-9"
            placeholder="Search examples…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="label sr-only">Category</label>
          <select className="input max-w-xs" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Tags</th>
              <th className="px-4 py-2 font-medium">Updated</th>
              <th className="px-4 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : listQuery.data?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-slate-500">
                  No examples found.
                </td>
              </tr>
            ) : (
              listQuery.data?.map((example) => (
                <tr key={example.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <button className="font-medium text-brand-700 hover:underline text-left" onClick={() => setViewingId(example.id)}>
                      {example.title}
                    </button>
                    {example.description ? <div className="text-xs text-slate-500 mt-1 line-clamp-2">{example.description}</div> : null}
                  </td>
                  <td className="px-4 py-2">{CATEGORY_LABELS[example.proposalCategory] || example.proposalCategory}</td>
                  <td className="px-4 py-2 capitalize">{example.proposalType || "—"}</td>
                  <td className="px-4 py-2">
                    {example.tags.length ? (
                      <div className="flex flex-wrap gap-1">
                        {example.tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="badge bg-slate-100 text-slate-700">
                            {tag}
                          </span>
                        ))}
                        {example.tags.length > 4 ? <span className="text-xs text-slate-500">+{example.tags.length - 4}</span> : null}
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{formatDateTime(example.updatedAt)}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn btn-secondary text-xs" onClick={() => setViewingId(example.id)}>
                        <Eye className="w-3.5 h-3.5 mr-1" /> View
                      </button>
                      <button className="btn btn-secondary text-xs" onClick={() => openEdit(example)}>
                        Edit
                      </button>
                      <button className="btn btn-secondary text-xs" onClick={() => duplicate.mutate({ id: example.id })} disabled={duplicate.isPending}>
                        <Copy className="w-3.5 h-3.5 mr-1" /> Duplicate
                      </button>
                      <button className="btn btn-secondary text-xs" onClick={() => remove.mutate({ id: example.id })} disabled={remove.isPending}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="card w-full max-w-4xl p-6 max-h-[90vh] flex flex-col">
            <div className="text-lg font-semibold mb-1">{editingId ? "Edit Proposal Example" : "New Proposal Example"}</div>
            <div className="text-sm text-slate-500 mb-4">Paste one of your existing proposals here to turn it into a reusable knowledge example.</div>
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              <Input label="Title" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={form.proposalCategory} onChange={(e) => setForm((current) => ({ ...current, proposalCategory: e.target.value as typeof form.proposalCategory }))}>
                    {CATEGORY_OPTIONS.filter((option) => option.value).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Proposal Type</label>
                  <select className="input" value={form.proposalType} onChange={(e) => setForm((current) => ({ ...current, proposalType: e.target.value as typeof form.proposalType }))}>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="restoration">Restoration</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="new_construction">New Construction</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <Input label="Description" value={form.description} onChange={(value) => setForm((current) => ({ ...current, description: value }))} />
              <TextArea
                label="Full Proposal Content"
                value={form.fullProposalContent}
                onChange={(value) => setForm((current) => ({ ...current, fullProposalContent: value }))}
                helperText="Paste the full formatted proposal content here."
              />
              <Input
                label="Tags"
                value={form.tagsText}
                onChange={(value) => setForm((current) => ({ ...current, tagsText: value }))}
                helperText="Separate tags with commas."
              />
              <TextArea label="Notes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} />
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-200 bg-white sticky bottom-0">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={!form.title.trim() || !form.fullProposalContent.trim() || create.isPending || update.isPending} onClick={save}>
                {create.isPending || update.isPending ? "Saving…" : "Save Example"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedExample && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="card w-full max-w-4xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-lg font-semibold">{selectedExample.title}</div>
                <div className="text-sm text-slate-500">{CATEGORY_LABELS[selectedExample.proposalCategory] || selectedExample.proposalCategory} · {selectedExample.proposalType || "No type"}</div>
              </div>
              <button className="btn btn-secondary" onClick={() => setViewingId(null)}>
                Close
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              {selectedExample.description ? (
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Description</div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{selectedExample.description}</div>
                </div>
              ) : null}

              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Full Proposal</div>
                <pre className="text-sm whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-md p-4">{selectedExample.fullProposalContent}</pre>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Tags</div>
                <div className="flex flex-wrap gap-1">
                  {selectedExample.tags.length ? selectedExample.tags.map((tag) => (
                    <span key={tag} className="badge bg-slate-100 text-slate-700">{tag}</span>
                  )) : <span className="text-sm text-slate-500">No tags</span>}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Notes</div>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">{selectedExample.notes || "—"}</div>
              </div>

              <div className="text-xs text-slate-500">Created {formatDateTime(selectedExample.createdAt)} · Updated {formatDateTime(selectedExample.updatedAt)}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Input({
  label,
  value,
  onChange,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
      {helperText ? <div className="text-xs text-slate-500 mt-1">{helperText}</div> : null}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea className="input min-h-32" value={value} onChange={(e) => onChange(e.target.value)} />
      {helperText ? <div className="text-xs text-slate-500 mt-1">{helperText}</div> : null}
    </div>
  );
}
