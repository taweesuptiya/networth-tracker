"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAccount, updateAccount, deleteAccount } from "@/app/actions/accounts";

export type Account = {
  id: string;
  name: string;
  type: "savings" | "credit_card" | "cash";
  last4: string | null;
  notes: string | null;
};

const TYPE_LABELS: Record<Account["type"], string> = {
  savings: "Savings",
  credit_card: "Credit card",
  cash: "Cash",
};

function AccountRow({
  account,
  onSaved,
  onDeleted,
}: {
  account: Account;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [type, setType] = useState<Account["type"]>(account.type);
  const [last4, setLast4] = useState(account.last4 ?? "");
  const [notes, setNotes] = useState(account.notes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateAccount(account.id, {
        name: name.trim(),
        type,
        last4: last4.trim() || null,
        notes: notes.trim() || null,
      });
      if (res.error) setError(res.error);
      else {
        setEditing(false);
        onSaved();
      }
    });
  }

  function onCancel() {
    setName(account.name);
    setType(account.type);
    setLast4(account.last4 ?? "");
    setNotes(account.notes ?? "");
    setError(null);
    setEditing(false);
  }

  function onDelete() {
    if (!confirm(`Delete account "${account.name}"? This won't delete existing transactions.`)) return;
    startTransition(async () => {
      await deleteAccount(account.id);
      onDeleted();
    });
  }

  if (editing) {
    return (
      <div className="rounded border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-2 text-xs">
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Account name"
            className="flex-1 min-w-32 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Account["type"])}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
          >
            <option value="savings">Savings</option>
            <option value="credit_card">Credit card</option>
            <option value="cash">Cash</option>
          </select>
          <input
            value={last4}
            onChange={(e) => setLast4(e.target.value.slice(0, 4))}
            placeholder="Last 4"
            maxLength={4}
            className="w-20 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 font-mono"
          />
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5"
        />
        {error && <p className="text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onSave}
            disabled={pending || !name.trim()}
            className="px-3 py-1.5 rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-500"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center text-xs px-3 py-2 rounded border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-medium truncate">{account.name}</span>
        <span className="text-zinc-500 shrink-0">{TYPE_LABELS[account.type]}</span>
        {account.last4 && (
          <span className="text-zinc-400 font-mono shrink-0">····{account.last4}</span>
        )}
        {account.notes && (
          <span className="text-zinc-400 truncate">{account.notes}</span>
        )}
      </div>
      <div className="flex gap-3 shrink-0 ml-3">
        <button
          onClick={() => setEditing(true)}
          disabled={pending}
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          className="text-red-500 hover:text-red-600"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function AccountsManager({
  workspaceId,
  accounts,
}: {
  workspaceId: string;
  accounts: Account[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<Account["type"]>("savings");
  const [last4, setLast4] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createAccount({
        workspace_id: workspaceId,
        name: name.trim(),
        type,
        last4: last4.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (res.error) setError(res.error);
      else {
        setName("");
        setLast4("");
        setNotes("");
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-3">
        Accounts ({accounts.length})
      </h2>

      <div className="space-y-1.5 mb-4">
        {accounts.length === 0 ? (
          <p className="text-xs text-zinc-400">No accounts yet. Add one below.</p>
        ) : (
          accounts.map((a) => (
            <AccountRow
              key={a.id}
              account={a}
              onSaved={() => router.refresh()}
              onDeleted={() => router.refresh()}
            />
          ))
        )}
      </div>

      <form onSubmit={onAdd} className="space-y-2 text-xs">
        <div className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Account name (e.g. KBANK Savings)"
            required
            className="flex-1 min-w-40 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Account["type"])}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
          >
            <option value="savings">Savings</option>
            <option value="credit_card">Credit card</option>
            <option value="cash">Cash</option>
          </select>
          <input
            value={last4}
            onChange={(e) => setLast4(e.target.value.slice(0, 4))}
            placeholder="Last 4"
            maxLength={4}
            className="w-20 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5 font-mono"
          />
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="px-3 py-1.5 rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            Add account
          </button>
        </div>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional — e.g. joint account, backup card)"
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
        />
      </form>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
