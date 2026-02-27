"use client";

import { useEffect, useState } from "react";

interface InputDialogProps {
  open: boolean;
  title: string;
  label: string;
  confirmText?: string;
  cancelText?: string;
  onClose: () => void;
  onConfirm: (value: string) => void | Promise<void>;
}

export function InputDialog({
  open,
  title,
  label,
  confirmText = "Guardar",
  cancelText = "Cancelar",
  onClose,
  onConfirm,
}: InputDialogProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setValue("");
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleConfirm() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    await onConfirm(trimmed);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        <label className="mb-4 flex flex-col gap-2">
          <span className="text-sm text-neutral-400">{label}</span>
          <input
            className="rounded border border-neutral-800 bg-neutral-900 p-2"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900"
            onClick={onClose}
            disabled={busy}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="rounded bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-50"
            onClick={handleConfirm}
            disabled={busy || value.trim().length === 0}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
