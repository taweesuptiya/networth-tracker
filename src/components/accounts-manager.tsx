"use client";

import { useState, useTransition } from "react";
import { createAccount, deleteAccount, linkAccountToAsset } from "@/app/actions/accounts";

export type Account = {
  id: string;
  name: string;
  type: "savings" | "credit_card" | "cash";
  last4: string | null;
  notes: string | null;
  linked_asset_id: string | null;
};

type AssetRef = { id: string; name: string; type: string };

export function AccountsManager({
  workspaceId,
  accounts,
  assets,
}: {
  workspaceId: string;
  accounts: Account[];
  assets: AssetRef[];
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Account["type"]>("savings");
  const [last4, setLast4] = useState("");
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
      });
      if (res.error) setError(res.error);
      else {
        setName("");
        setLast4("");
      }
    });
  }

  function onDel(id: string, aName: string) {
    if (!confirm(`Delete account "${aName}"?`)) return;
    startTransition(async () => {
      await deleteAccount(id);
    });
  }

  function onLinkAsset(accountId: string, assetId: string) {
    startTransition(async () => {
      await linkAccountToAsset(accountId, assetId || null);
    });
  }

  const cashAssets = assets.filter((a) => a.type === "Cash");

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-3">Accounts</h2>
      <div className="space-y-1 mb-3">
        {accounts.length === 0 ? (
          <p className="text-xs text-zinc-400">No accounts yet. Add one below.</p>
        ) : (
          accounts.map((a) => (
            <div
              key={a.id}
              className="flex justify-between items-center text-xs px-3 py-2 rounded border border-zinc-200 dark:border-zinc-800 gap-3"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="font-medium truncate">{a.name}</span>
                <span className="text-zinc-500 shrink-0">{a.type}</span>
                {a.last4 && <span className="text-zinc-400 font-mono shrink-0">····{a.last4}</span>}
              </div>
              {a.type !== "credit_card" && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-zinc-400">→ NW asset:</span>
                  <select
                    value={a.linked_asset_id ?? ""}
                    onChange={(e) => onLinkAsset(a.id, e.target.value)}
                    disabled={pending}
                    className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1.5 py-0.5 text-xs max-w-36"
                  >
                    <option value="">— none —</option>
                    {cashAssets.map((ast) => (
                      <option key={ast.id} value={ast.id}>
                        {ast.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                onClick={() => onDel(a.id, a.name)}
                disabled={pending}
                className="text-red-500 hover:text-red-600 shrink-0"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
      <form onSubmit={onAdd} className="flex flex-wrap gap-2 text-xs">
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
          onChange={(e) => setLast4(e.target.value)}
          placeholder="Last 4 (optional)"
          className="w-24 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
        />
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="px-3 py-1.5 rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {cashAssets.length === 0 && accounts.some((a) => a.type !== "credit_card") && (
        <p className="mt-2 text-xs text-zinc-400">
          No Cash assets found. Add a Cash-type asset on the dashboard to enable auto-balance sync.
        </p>
      )}
    </div>
  );
}
