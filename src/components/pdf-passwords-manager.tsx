"use client";

import { useState, useTransition } from "react";
import { addPdfPassword, deletePdfPassword } from "@/app/actions/pdf_passwords";

export type PdfPassword = {
  id: string;
  label: string | null;
  password: string;
};

export function PdfPasswordsManager({ initial }: { initial: PdfPassword[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await addPdfPassword(label.trim(), password);
      if (res.error) setError(res.error);
      else {
        setLabel("");
        setPassword("");
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this password?")) return;
    startTransition(async () => {
      await deletePdfPassword(id);
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        <span>🔐 Saved PDF passwords ({initial.length})</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-zinc-500">
            On upload, the server tries each password in order until one decrypts the PDF.
            Common Thai bank patterns: last 4 of ID, DOB (DDMMYYYY), phone last 4.
          </p>

          <div className="space-y-1">
            {initial.length === 0 ? (
              <p className="text-xs text-zinc-400">No passwords saved yet.</p>
            ) : (
              initial.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs px-3 py-2 rounded border border-zinc-200 dark:border-zinc-800"
                >
                  <div>
                    <span className="font-medium">{p.label || "(no label)"}</span>
                    <span className="text-zinc-400 ml-3 font-mono">
                      {"•".repeat(Math.min(p.password.length, 12))}
                    </span>
                  </div>
                  <button
                    onClick={() => onDelete(p.id)}
                    disabled={pending}
                    className="text-red-500 hover:text-red-600 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>

          <form onSubmit={onAdd} className="flex flex-wrap gap-2 pt-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional, e.g. KBank)"
              className="flex-1 min-w-32 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5 text-xs"
            />
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="flex-1 min-w-32 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5 text-xs font-mono"
            />
            <button
              type="submit"
              disabled={pending || !password.trim()}
              className="px-3 py-1.5 text-xs rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              Add
            </button>
          </form>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
