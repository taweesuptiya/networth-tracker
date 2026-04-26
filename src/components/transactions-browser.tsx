"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

const fmt = (n: number) =>
  Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function TransactionsBrowser({
  txs,
  accounts,
  categoriesByType,
  workspaceId,
}: {
  txs: Tx[];
  accounts: AccountRef[];
  categoriesByType: Record<string, string[]>;
  workspaceId: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [page, setPage] = useState(0);

  // Filters — seed initial values from URL search params so deep links from Projection work
  const [search, setSearch] = useState(sp.get("q") ?? "");
  const [accountId, setAccountId] = useState<string>(sp.get("account") ?? "");
  const [txType, setTxType] = useState<string>(sp.get("tx_type") ?? "");
  const [category, setCategory] = useState<string>(sp.get("category") ?? "");
  const [from, setFrom] = useState<string>(sp.get("from") ?? "");
  const [to, setTo] = useState<string>(sp.get("to") ?? "");

  // Sorting
  type SortKey = "occurred_at" | "amount" | "description" | "category" | "tx_type";
  const [sortKey, setSortKey] = useState<SortKey>("occurred_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "amount" ? "desc" : "asc");
    }
  }
  function sortIndicator(k: SortKey) {
    if (sortKey !== k) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  // Selection + AI suggestion state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<string>("");
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiResult, setAiResult] = useState<Record<string, string>>({});
  const [autofillProgress, setAutofillProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const result = txs.filter((t) => {
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
      if (accountId && t.account_id !== accountId) return false;
      if (txType && t.tx_type !== txType) return false;
      if (category && (t.category ?? "").toLowerCase() !== category.toLowerCase())
        return false;
      if (from && t.occurred_at < from) return false;
      if (to && t.occurred_at > to) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    result.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "occurred_at":
          av = a.occurred_at;
          bv = b.occurred_at;
          break;
        case "amount":
          av = Number(a.amount);
          bv = Number(b.amount);
          break;
        case "description":
          av = a.description.toLowerCase();
          bv = b.description.toLowerCase();
          break;
        case "category":
          av = (a.category ?? "").toLowerCase();
          bv = (b.category ?? "").toLowerCase();
          break;
        case "tx_type":
          av = a.tx_type;
          bv = b.tx_type;
          break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return result;
  }, [txs, search, accountId, txType, category, from, to, sortKey, sortDir]);

  // Summary stats for the filtered set (P&L-aware: nets reimbursements, ignores transfers/cc payments)
  const summary = useMemo(() => {
    let income = 0;
    let grossExpense = 0;
    let reimbursement = 0;
    let transfer = 0;
    let ccPayment = 0;
    let creditTotal = 0;
    let debitTotal = 0;
    for (const t of filtered) {
      const amt = Number(t.amount);
      if (t.direction === "credit") creditTotal += amt;
      else debitTotal += amt;
      switch (t.tx_type) {
        case "income":
          income += amt;
          break;
        case "expense":
          grossExpense += amt;
          break;
        case "reimbursement":
          reimbursement += amt;
          break;
        case "transfer":
          transfer += amt;
          break;
        case "cc_payment":
        case "cc_payment_received":
          ccPayment += amt;
          break;
      }
    }
    const netExpense = grossExpense - reimbursement;
    const netSave = income - netExpense;
    return {
      count: filtered.length,
      income,
      grossExpense,
      reimbursement,
      netExpense,
      netSave,
      transfer,
      ccPayment,
      creditTotal,
      debitTotal,
    };
  }, [filtered]);

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

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((r) => r.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function togglePage() {
    if (allOnPageSelected) {
      const next = new Set(selected);
      for (const r of pageRows) next.delete(r.id);
      setSelected(next);
    } else {
      const next = new Set(selected);
      for (const r of pageRows) next.add(r.id);
      setSelected(next);
    }
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
          workspace_id: workspaceId,
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

  async function onAutofillMissing() {
    const missing = txs.filter(
      (t) =>
        (!t.category || t.category.trim() === "") &&
        (t.tx_type === "expense" ||
          t.tx_type === "income" ||
          t.tx_type === "reimbursement" ||
          t.tx_type === "auto")
    );
    if (missing.length === 0) {
      alert("No transactions without a category.");
      return;
    }
    if (
      !confirm(
        `Auto-fill categories for ${missing.length} transactions using AI? Suggestions apply automatically.`
      )
    ) {
      return;
    }
    setError(null);
    setAutofillProgress(`Starting (${missing.length} transactions)...`);
    const BATCH = 80;
    let applied = 0;
    let failed = 0;
    try {
      for (let i = 0; i < missing.length; i += BATCH) {
        const slice = missing.slice(i, i + BATCH);
        setAutofillProgress(
          `Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(missing.length / BATCH)} (${
            i + slice.length
          }/${missing.length}) — calling AI...`
        );
        const payload = slice.map((t) => ({
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
        if (!res.ok) {
          failed += slice.length;
          continue;
        }
        const json = await res.json();
        const ids = (json.suggestions ?? []) as { id: string; category: string }[];
        setAutofillProgress(
          `Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(
            missing.length / BATCH
          )} — applying ${ids.length} suggestions...`
        );
        for (const s of ids) {
          await updateTransaction(s.id, { category: s.category });
          applied++;
        }
      }
      setAutofillProgress(`✓ Done. Applied ${applied}, failed ${failed}. Refreshing...`);
      router.refresh();
      setTimeout(() => setAutofillProgress(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAutofillProgress(null);
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
      {Object.entries(categoriesByType).map(([type, list]) => {
        // Merge budget categories with any existing user-typed categories of that type
        const merged = Array.from(new Set([...list, ...allCategories]));
        return (
          <datalist key={type} id={`tx-cat-${type}`}>
            {merged.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        );
      })}
      {/* Top action bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <button
          onClick={onAutofillMissing}
          disabled={autofillProgress !== null}
          className="px-3 py-1.5 rounded-lg border border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50"
        >
          ✨ AI fill missing categories
        </button>
        {autofillProgress && (
          <span className="text-zinc-500">{autofillProgress}</span>
        )}
      </div>

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
            list={bulkType ? `tx-cat-${bulkType}` : "tx-cat-auto"}
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

      {/* Summary stats for filtered set */}
      {filtered.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-3 overflow-hidden">
          <div className="px-4 py-2 bg-paper-darker border-b text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            Summary · {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x">
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                Income
              </div>
              <div className="font-mono tabular text-base text-jade-bright mt-1">
                {summary.income > 0 ? `+${fmt(summary.income)}` : "—"}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                Expenses (gross)
              </div>
              <div className="font-mono tabular text-base text-oxblood-bright mt-1">
                {summary.grossExpense > 0 ? `−${fmt(summary.grossExpense)}` : "—"}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                Reimbursements
              </div>
              <div className="font-mono tabular text-base text-jade-bright mt-1">
                {summary.reimbursement > 0 ? `+${fmt(summary.reimbursement)}` : "—"}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                Net expense
              </div>
              <div className="font-mono tabular text-base mt-1">
                {summary.netExpense !== 0
                  ? `${summary.netExpense >= 0 ? "−" : "+"}${fmt(Math.abs(summary.netExpense))}`
                  : "—"}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                Net flow
              </div>
              <div
                className={
                  "font-mono tabular text-base mt-1 " +
                  (summary.netSave >= 0 ? "text-jade-bright" : "text-oxblood-bright")
                }
              >
                {summary.netSave !== 0
                  ? `${summary.netSave >= 0 ? "+" : "−"}${fmt(Math.abs(summary.netSave))}`
                  : "—"}
              </div>
            </div>
          </div>
          {(summary.transfer > 0 || summary.ccPayment > 0) && (
            <div className="px-4 py-2 border-t text-[11px] text-ink-faint flex flex-wrap gap-x-6 gap-y-1">
              {summary.transfer > 0 && (
                <span>Transfers: {fmt(summary.transfer)} (excluded from P&amp;L)</span>
              )}
              {summary.ccPayment > 0 && (
                <span>CC payments: {fmt(summary.ccPayment)} (excluded from P&amp;L)</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-3">
        <div className="flex justify-between items-center px-4 py-2 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
          <span>
            {filtered.length} transaction{filtered.length === 1 ? "" : "s"}
            {selected.size > 0 && (
              <span className="ml-2 text-zinc-700 dark:text-zinc-300">
                · {selected.size} selected
              </span>
            )}
          </span>
          <div className="flex gap-3">
            <button
              onClick={selectAllVisible}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Select page
            </button>
            <button
              onClick={selectAllFiltered}
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              Select all filtered ({filtered.length})
            </button>
            {selected.size > 0 && (
              <button
                onClick={clearSelection}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Clear ({selected.size})
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={togglePage}
                    title={allOnPageSelected ? "Unselect page" : "Select page"}
                  />
                </th>
                <th
                  className="px-3 py-2 cursor-pointer hover:text-ink select-none"
                  onClick={() => toggleSort("occurred_at")}
                >
                  Date{sortIndicator("occurred_at")}
                </th>
                <th className="px-3 py-2">Account</th>
                <th
                  className="px-3 py-2 cursor-pointer hover:text-ink select-none"
                  onClick={() => toggleSort("description")}
                >
                  Description{sortIndicator("description")}
                </th>
                <th
                  className="px-3 py-2 cursor-pointer hover:text-ink select-none"
                  onClick={() => toggleSort("tx_type")}
                >
                  Type{sortIndicator("tx_type")}
                </th>
                <th
                  className="px-3 py-2 cursor-pointer hover:text-ink select-none"
                  onClick={() => toggleSort("category")}
                >
                  Category{sortIndicator("category")}
                </th>
                <th
                  className="px-3 py-2 text-right cursor-pointer hover:text-ink select-none"
                  onClick={() => toggleSort("amount")}
                >
                  Amount{sortIndicator("amount")}
                </th>
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
                        list={`tx-cat-${t.tx_type}`}
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
