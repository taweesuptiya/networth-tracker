"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRule, deleteRule, seedDefaultRules } from "@/app/actions/accounts";
import type { Rule } from "@/lib/tx-rules";

const TX_TYPES: Rule["set_tx_type"][] = [
  "income",
  "expense",
  "transfer",
  "cc_payment",
  "cc_payment_received",
  "reimbursement",
];

export function RulesManager({
  workspaceId,
  rules,
}: {
  workspaceId: string;
  rules: Rule[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const [pattern, setPattern] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "regex">("contains");
  const [accountType, setAccountType] = useState<Rule["applies_to_account_type"]>("all");
  const [direction, setDirection] = useState<Rule["applies_to_direction"]>("all");
  const [setTxType, setSetTxType] = useState<Rule["set_tx_type"]>("expense");
  const [setCategory, setSetCategory] = useState("");
  const [priority, setPriority] = useState(100);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createRule({
        workspace_id: workspaceId,
        priority,
        pattern,
        match_type: matchType,
        applies_to_account_type: accountType,
        applies_to_direction: direction,
        set_tx_type: setTxType,
        set_category: setCategory.trim() || null,
      });
      if (res.error) setError(res.error);
      else {
        setPattern("");
        setSetCategory("");
        router.refresh();
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm("Delete this rule?")) return;
    startTransition(async () => {
      await deleteRule(id);
      router.refresh();
    });
  }

  function onSeed() {
    if (!confirm("Add the starter rule pack? (You can edit/delete any of them after.)")) return;
    startTransition(async () => {
      await seedDefaultRules(workspaceId);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-medium text-zinc-500">
          Categorization rules ({rules.length})
        </h2>
        <div className="flex gap-2 text-xs">
          {rules.length === 0 && (
            <button
              onClick={onSeed}
              disabled={pending}
              className="text-blue-600 hover:text-blue-700"
            >
              ✨ Seed default rules
            </button>
          )}
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            {showForm ? "Cancel" : "+ Add rule"}
          </button>
        </div>
      </div>

      {rules.length > 0 && (
        <div className="overflow-x-auto mb-3">
          <table className="w-full text-xs">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="px-2 py-1">Prio</th>
                <th className="px-2 py-1">Pattern</th>
                <th className="px-2 py-1">Match</th>
                <th className="px-2 py-1">Account</th>
                <th className="px-2 py-1">Dir</th>
                <th className="px-2 py-1">→ Type</th>
                <th className="px-2 py-1">→ Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="px-2 py-1">{r.priority}</td>
                  <td className="px-2 py-1 font-mono break-all max-w-64">{r.pattern}</td>
                  <td className="px-2 py-1 text-zinc-500">{r.match_type}</td>
                  <td className="px-2 py-1 text-zinc-500">{r.applies_to_account_type}</td>
                  <td className="px-2 py-1 text-zinc-500">{r.applies_to_direction}</td>
                  <td className="px-2 py-1">{r.set_tx_type}</td>
                  <td className="px-2 py-1">{r.set_category ?? "—"}</td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={() => onDelete(r.id)}
                      disabled={pending}
                      className="text-red-500 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <form onSubmit={onAdd} className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs pt-2">
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            placeholder="Priority (lower = first)"
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          />
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="Pattern (e.g. AGODA)"
            required
            className="col-span-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 font-mono"
          />
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as typeof matchType)}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          >
            <option value="contains">Contains</option>
            <option value="regex">Regex</option>
          </select>
          <select
            value={accountType}
            onChange={(e) =>
              setAccountType(e.target.value as Rule["applies_to_account_type"])
            }
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          >
            <option value="all">All accounts</option>
            <option value="savings">Savings only</option>
            <option value="credit_card">Credit card only</option>
            <option value="cash">Cash only</option>
          </select>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as Rule["applies_to_direction"])}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          >
            <option value="all">Any direction</option>
            <option value="credit">Credit only</option>
            <option value="debit">Debit only</option>
          </select>
          <select
            value={setTxType}
            onChange={(e) => setSetTxType(e.target.value as Rule["set_tx_type"])}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          >
            {TX_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            value={setCategory}
            onChange={(e) => setSetCategory(e.target.value)}
            placeholder="Category (e.g. Dining)"
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          />
          <button
            type="submit"
            disabled={pending || !pattern.trim()}
            className="col-span-2 md:col-span-1 px-3 py-1.5 rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            Add rule
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
