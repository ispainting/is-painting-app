"use client";

import type { ReactNode } from "react";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
  isPending = false,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <div className="mt-3 text-sm leading-6 text-slate-600">{message}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isPending}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? "btn bg-rose-600 text-white hover:bg-rose-700" : "btn btn-primary"}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
