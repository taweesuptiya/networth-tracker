"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  bulkUpdateTransactions,
  deleteTransactions,
  updateTransaction,
} from "@/app/actions/transactions";

export type Tx = {
  id: string;
  occurred_at: string;
  description: string;
  amount: number;
  currency: string;
  direction: "credit" | "debit";
  tx_type: string;
  category: string | null;
  account_id: string | null;
};

export type AccountRef = { id: string; name: string; type: string };

const TX_TYPES = [
  "auto",
  "income",
  "expense",
  "transfer",
  "cc_payment",
  "cc_payment_received",
  "reimbursement",
];

const PAGE_SIZE = 100;

export function TransactionsBrowser({
  txs,
  accounts,
}: {
  txs: Tx[];
  accounts: AccountRef[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [txType, setTxType] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // Selection + AI suggestion state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<string>("");
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiResult, setAiResult] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return txs.filter((t) => {
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (accountId && t.account_id !== accountId) return false;
      if (txType && t.tx_type !== txType) return false;
      if (category && (t.category ?? "").toLowerCase() !== category.toLowerCase())
        return false;
      if (from && t.occurred_at < from) return false;
      if (to && t.occurred_at > to) return false;
      return true;
    });
  }, [txs, search, accountId, txType, category, from, to]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const allCategories = useMemo(
    () =>
      Array.from(
        new Set(txs.map((t) => t.category).filter((c): c is string => !!c))
      ).sort(),
    [txs]
  );

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function selectAllVisible() {
    setSelected(new Set(pageRows.map((r) => r.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function onBulkUpdate() {
    if (selected.size === 0) return;
    const patch: { tx_type?: string; category?: string | null } = {};
    if (bulkType) patch.tx_type = bulkType;
    if (bulkCategory) patch.category = bulkCategory.trim() || null;
    if (Object.keys(patch).length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await bulkUpdateTransactions(Array.from(selected), patch);
      if (res.error) setError(res.error);
      else {
        setBulkType("");
        setBulkCategory("");
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function onBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} transactions? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTransactions(Array.from(selected));
      if (res.error) setError(res.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function onRowEdit(id: string, patch: Partial<Tx>) {
    startTransition(async () => {
      await updateTransaction(id, {
        tx_type: patch.tx_type,
        category: patch.category,
      });
      router.refresh();
    });
  }

  async function onAiSuggest() {
    if (selected.size === 0) return;
    setError(null);
    setAiSuggesting(true);
    try {
      const items = Array.from(selected).slice(0, 100);
      const txMap = new Map(txs.map((t) => [t.id, t]));
      const payload = items
        .map((id) => txMap.get(id))
        .filter((t): t is Tx => !!t)
        .map((t) => ({
          id: t.id,
          description: t.description,
          direction: t.direction,
          amount: t.amount,
        }));
      const res = await fetch("/api/suggest-categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactions: payload,
          existing_categories: allCategories,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const map: Record<string, string> = {};
      for (const s of json.suggestions ?? []) {
        map[s.id] = s.category;
      }
      setAiResult(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiSuggesting(false);
    }
  }

  function applyAiSuggestions() {
    const ids = Object.keys(aiResult);
    if (ids.length === 0) return;
    startTransition(async () => {
      // Apply each suggestion (one per id since categories may differ)
      for (const id of ids) {
        await updateTransaction(id, { category: aiResult[id] });
      }
      setAiResult({});
      router.refresh();
    });
  }

  const accountName = (id: string | null) =>
    accounts.find((a) => a.id === id)?.name ?? "—";

  return (
    <>
      <datalist id="tx-category-options">
        {allCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {/* Filters */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 mb-4 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Search description"
          className="col-span-2 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
        />
        <select
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            setPage(0);
          }}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          value={txType}
          onChange={(e) => {
            setTxType(e.target.value);
            setPage(0);
          }}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
        >
          <option value="">All types</option>
          {TX_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
        >
          <option value="">All categories</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(0);
          }}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
          placeholder="From"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(0);
          }}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
          placeholder="To"
        />
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 mb-4 flex flex-wrap items-center gap-2 text-xs bg-zinc-50 dark:bg-zinc-900">
          <span className="font-medium">{selected.size} selected:</span>
          <select
            value={bulkType}
            onChange={(e) => setBulkType(e.target.value)}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
          >
            <option value="">— set type —</option>
            {TX_TYPES.filter((t) => t !== "auto").map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            list="tx-category-options"
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            placeholder="— set category —"
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5 w-40"
          />
          <button
            onClick={onBulkUpdate}
            disabled={pending || (!bulkType && !bulkCategory)}
            className="px-3 py-1.5 rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            Apply
          </button>
          <button
            onClick={onAiSuggest}
            disabled={aiSuggesting}
            className="px-3 py-1.5 rounded border border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50"
          >
            {aiSuggesting ? "AI thinking..." : "✨ AI suggest categories"}
          </button>
          <button
            onClick={onBulkDelete}
            disabled={pending}
            className="px-3 py-1.5 rounded border border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
          >
            Delete
          </button>
          <button
            onClick={clearSelection}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Clear
          </button>
        </div>
      )}

      {Object.keys(aiResult).length > 0 && (
        <div className="rounded-2xl border border-blue-300 dark:border-blue-700 p-4 mb-4 text-xs bg-blue-50 dark:bg-blue-950/30">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">
              ✨ AI suggested {Object.keys(aiResult).length} categories
            </span>
            <div className="flex gap-2">
              <button
                onClick={applyAiSuggestions}
                disabled={pending}
                className="px-3 py-1.5 rounded bg-blue-600 text-white"
              >
                Apply all
              </button>
              <button
                onClick={() => setAiResult({})}
                className="text-zinc-500 hover:text-zinc-900"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="max-h-32 overflow-y-auto">
            {Object.entries(aiResult).map(([id, cat]) => {
              const tx = txs.find((t) => t.id === id);
              if (!tx) return null;
              return (
                <div key={id} className="flex justify-between border-t border-blue-200 dark:border-blue-800 py-1">
                  <span className="truncate max-w-md text-zinc-600">{tx.description}</span>
                  <span className="font-medium text-blue-700 dark:text-blue-400">{cat}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {/* Table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-3">
        <div className="flex justify-between items-center px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
          <span>
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
          </span>
          <button
            onClick={selectAllVisible}
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Select all on page
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                    No transactions match your filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((t) => (
                  <tr key={t.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggle(t.id)}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.occurred_at}</td>
                    <td className="px-3 py-2 text-zinc-500">{accountName(t.account_id)}</td>
                    <td className="px-3 py-2 max-w-md truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={t.tx_type}
                        onChange={(e) => onRowEdit(t.id, { tx_type: e.target.value })}
                        className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 py-0.5"
                      >
                        {TX_TYPES.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        list="tx-category-options"
                        defaultValue={t.category ?? ""}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (t.category ?? "")) {
                            onRowEdit(t.id, { category: v || null });
                          }
                        }}
                        className="w-36 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 py-0.5"
                      />
                    </td>
                    <td
                      className={`px-3 py-2 text-right whitespace-nowrap ${
                        t.direction === "credit" ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {t.direction === "credit" ? "+" : "−"}
                      {Number(t.amount).toLocaleString("en-US", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {t.currency}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 text-xs">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-zinc-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}
