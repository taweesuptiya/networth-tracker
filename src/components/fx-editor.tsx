"use client";

import { useState, useTransition } from "react";
import { updateFxRate } from "@/app/actions/assets";

export function FxEditor({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: number;
}) {
  const [value, setValue] = useState(initial.toString());
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return;
    startTransition(async () => {
      await updateFxRate(workspaceId, n);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        FX: 1 USD = {initial.toFixed(2)} THB ✏️
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500">1 USD =</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
      />
      <span className="text-zinc-500">THB</span>
      <button
        onClick={save}
        disabled={pending}
        className="px-2 py-1 rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
      >
        {pending ? "..." : "Save"}
      </button>
      <button
        onClick={() => {
          setValue(initial.toString());
          setEditing(false);
        }}
        className="text-zinc-500"
      >
        Cancel
      </button>
    </div>
  );
}
