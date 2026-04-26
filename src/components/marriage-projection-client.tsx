"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  defaultMarriageConfig,
  projectMarriage,
  type MarriageProjectionConfig,
  type MarriageMonthRow,
  type ExpenseLine,
  type ScheduleEntry,
} from "@/lib/projection";
import { saveProjectionConfig, saveAsBudget, clearBudget } from "@/app/actions/projection";

const fmt = (n: number) =>
  Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

type ActualMonth = {
  month: string;
  income: number;
  expense: number;
  expense_by_category?: Record<string, number>;
  gross_expense_by_category?: Record<string, number>;
  reimbursement_by_category?: Record<string, number>;
};

export type SavedBudgetMarriage = {
  month: string;
  income_budget: number;
  expense_budget: number;
  net_save_budget: number;
  total_networth_budget: number;
  expense_lines?: { label: string; amount: number }[];
};

// ── helpers ───────────────────────────────────────────────────────────────

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function txLink(workspaceId: string, month: string, opts: { category?: string; tx_type?: string }) {
  const { from, to } = monthRange(month);
  const params = new URLSearchParams({ ws: workspaceId, from, to });
  if (opts.category) params.set("category", opts.category);
  if (opts.tx_type) params.set("tx_type", opts.tx_type);
  return `/transactions?${params.toString()}`;
}

// ── settings sub-components ───────────────────────────────────────────────

function NumInput({
  value,
  onChange,
  step = "any",
}: {
  value: number;
  onChange: (n: number) => void;
  step?: string;
}) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1 text-xs w-32"
    />
  );
}

function ScheduleEditor({
  label,
  schedule,
  onChange,
}: {
  label: string;
  schedule: ScheduleEntry[];
  onChange: (s: ScheduleEntry[]) => void;
}) {
  const [newMonth, setNewMonth] = useState("");
  const [newAmount, setNewAmount] = useState(0);
  return (
    <div className="space-y-1 mt-1">
      <div className="text-xs font-medium text-zinc-500">{label} — one-time schedule</div>
      {schedule.map((s, i) => (
        <div key={i} className="flex gap-2 text-xs items-center">
          <input
            type="month"
            value={s.month}
            onChange={(e) => {
              const next = [...schedule];
              next[i] = { ...next[i], month: e.target.value };
              onChange(next);
            }}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
          />
          <NumInput
            value={s.amount}
            onChange={(n) => {
              const next = [...schedule];
              next[i] = { ...next[i], amount: n };
              onChange(next);
            }}
          />
          <button
            type="button"
            onClick={() => onChange(schedule.filter((_, j) => j !== i))}
            className="text-red-500 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2 text-xs items-center">
        <input
          type="month"
          value={newMonth}
          onChange={(e) => setNewMonth(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
        />
        <NumInput value={newAmount} onChange={setNewAmount} />
        <button
          type="button"
          onClick={() => {
            if (!newMonth || newAmount === 0) return;
            onChange([...schedule, { month: newMonth, amount: newAmount }]);
            setNewMonth("");
            setNewAmount(0);
          }}
          className="text-green-600 hover:text-green-700"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

// ── table sub-components (same as projection-table.tsx) ───────────────────

function Section({ label }: { label: string }) {
  return (
    <tr className="bg-zinc-100 dark:bg-zinc-800/50">
      <td
        colSpan={1000}
        className="px-3 py-1.5 text-[10px] uppercase tracking-wide font-medium text-zinc-500 sticky left-0"
      >
        {label}
      </td>
    </tr>
  );
}

function SectionToggle({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="bg-zinc-100 dark:bg-zinc-800/50">
      <td
        colSpan={1000}
        className="px-3 py-1.5 text-[10px] uppercase tracking-wide font-medium text-zinc-500 sticky left-0 cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-100"
        onClick={onToggle}
      >
        {expanded ? "▾" : "▸"} {label} {expanded ? "(per category)" : "— click to expand"}
      </td>
    </tr>
  );
}

function Row({
  label,
  values,
  bold,
  muted,
  highlight,
  percent,
  variance,
  positiveIsGood,
  linkBuilder,
}: {
  label: string;
  values: number[];
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
  percent?: boolean;
  variance?: boolean;
  positiveIsGood?: boolean;
  linkBuilder?: (value: number, index: number) => string;
}) {
  return (
    <tr
      className={
        "border-t border-zinc-200 dark:border-zinc-800 " +
        (highlight ? "bg-blue-50 dark:bg-blue-950/30 " : "") +
        (muted ? "text-zinc-500 " : "") +
        (bold ? "font-medium " : "")
      }
    >
      <td className="px-3 py-1.5 sticky left-0 bg-white dark:bg-zinc-950 whitespace-nowrap">
        {label}
      </td>
      {values.map((v, i) => {
        let cls = "px-3 py-1.5 text-right whitespace-nowrap ";
        if (variance) {
          if (v > 0) cls += positiveIsGood ? "text-green-600 " : "text-red-500 ";
          else if (v < 0) cls += positiveIsGood ? "text-red-500 " : "text-green-600 ";
        }
        const display = percent
          ? `${v.toFixed(1)}%`
          : v === 0
            ? "—"
            : (variance && v > 0 ? "+" : "") + fmt(v);
        const inner =
          linkBuilder && v !== 0 ? (
            <Link
              href={linkBuilder(v, i)}
              prefetch={false}
              className="hover:underline hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              {display}
            </Link>
          ) : (
            display
          );
        return (
          <td key={i} className={cls}>
            {inner}
          </td>
        );
      })}
    </tr>
  );
}

function CategoryGroup({
  label,
  forecast,
  budget,
  gross,
  reimbursement,
  actual,
  variance,
  linkBuilder,
  reimbLinkBuilder,
}: {
  label: string;
  forecast: number[];
  budget: number[];
  gross: number[];
  reimbursement: number[];
  actual: number[];
  variance: number[];
  linkBuilder: (value: number, index: number) => string;
  reimbLinkBuilder: (value: number, index: number) => string;
}) {
  const pctOfBudget = actual.map((a, i) => (budget[i] > 0 ? (a / budget[i]) * 100 : 0));
  const hasReimb = reimbursement.some((v) => v > 0);
  return (
    <>
      <tr className="border-t border-zinc-200 dark:border-zinc-800">
        <td className="px-3 py-1.5 sticky left-0 bg-white dark:bg-zinc-950 whitespace-nowrap font-medium pl-6">
          {label}
        </td>
        {forecast.map((v, i) => (
          <td key={i} className="px-3 py-1.5 text-right whitespace-nowrap">
            {v === 0 ? "—" : fmt(v)}
          </td>
        ))}
      </tr>
      <Row label="↳ Budget" values={budget} muted />
      {hasReimb && (
        <>
          <Row label="↳ Gross spend" values={gross} muted linkBuilder={linkBuilder} />
          <Row
            label="↳ Reimbursements"
            values={reimbursement.map((v) => -v)}
            muted
            linkBuilder={reimbLinkBuilder}
          />
        </>
      )}
      <Row label="↳ Net actual" values={actual} muted linkBuilder={linkBuilder} />
      <Row label="↳ % of budget" values={pctOfBudget} muted percent />
      <Row label="↳ Variance" values={variance} muted variance />
    </>
  );
}

// ── marriage projection table ─────────────────────────────────────────────

function MarriageProjectionTable({
  rows,
  actuals,
  savedBudgets,
  workspaceId,
}: {
  rows: MarriageMonthRow[];
  actuals: ActualMonth[];
  savedBudgets: SavedBudgetMarriage[];
  workspaceId: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandExpenses, setExpandExpenses] = useState(false);
  const [expandAssets, setExpandAssets] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 12);

  const actualMap = new Map(actuals.map((a) => [a.month, a]));
  const budgetMap = new Map(savedBudgets.map((b) => [b.month, b]));

  // Collect all expense category labels
  const allCategories = new Set<string>();
  for (const r of visible) for (const e of r.expense_breakdown) allCategories.add(e.label);
  for (const b of savedBudgets) for (const l of b.expense_lines ?? []) allCategories.add(l.label);
  for (const a of actuals)
    if (a.expense_by_category) for (const k of Object.keys(a.expense_by_category)) allCategories.add(k);
  const categories = Array.from(allCategories).sort();

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6">
      <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-500">Forecast vs Budget vs Actual</h2>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {showAll ? "Show first 12" : `Show all ${rows.length}`}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2 sticky left-0 bg-zinc-50 dark:bg-zinc-900 z-10">Line</th>
              {visible.map((r) => (
                <th key={r.month} className="px-3 py-2 text-right whitespace-nowrap">
                  {r.month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ── INCOME ── */}
            <Section label="INCOME" />
            <Row label="Forecast" values={visible.map((r) => r.total_income)} bold />
            <Row
              label="↳ Budget"
              values={visible.map((r) => budgetMap.get(r.month)?.income_budget ?? 0)}
              muted
            />
            <Row
              label="↳ Actual"
              values={visible.map((r) => actualMap.get(r.month)?.income ?? 0)}
              muted
              linkBuilder={(_v, i) => txLink(workspaceId, visible[i].month, { tx_type: "income" })}
            />
            <Row
              label="↳ Variance (Actual − Budget)"
              values={visible.map((r) => {
                const b = budgetMap.get(r.month)?.income_budget ?? 0;
                const a = actualMap.get(r.month)?.income ?? 0;
                return b === 0 || a === 0 ? 0 : a - b;
              })}
              muted
              variance
              positiveIsGood
            />

            {/* ── EXPENSES ── */}
            <SectionToggle
              label="EXPENSES"
              expanded={expandExpenses}
              onToggle={() => setExpandExpenses((v) => !v)}
            />
            <Row label="Forecast" values={visible.map((r) => r.expenses)} bold />
            <Row
              label="↳ Budget"
              values={visible.map((r) => budgetMap.get(r.month)?.expense_budget ?? 0)}
              muted
            />
            <Row
              label="↳ Actual"
              values={visible.map((r) => actualMap.get(r.month)?.expense ?? 0)}
              muted
              linkBuilder={(_v, i) => txLink(workspaceId, visible[i].month, { tx_type: "expense" })}
            />
            <Row
              label="↳ Variance (Actual − Budget)"
              values={visible.map((r) => {
                const b = budgetMap.get(r.month)?.expense_budget ?? 0;
                const a = actualMap.get(r.month)?.expense ?? 0;
                return b === 0 || a === 0 ? 0 : a - b;
              })}
              muted
              variance
            />

            {expandExpenses &&
              categories.map((cat) => {
                const forecastVals = visible.map(
                  (r) => r.expense_breakdown.find((e) => e.label === cat)?.amount ?? 0
                );
                const budgetVals = visible.map(
                  (r) =>
                    budgetMap.get(r.month)?.expense_lines?.find((l) => l.label === cat)?.amount ?? 0
                );
                const grossVals = visible.map(
                  (r) =>
                    actualMap.get(r.month)?.gross_expense_by_category?.[cat] ??
                    actualMap.get(r.month)?.expense_by_category?.[cat] ??
                    0
                );
                const reimbVals = visible.map(
                  (r) => actualMap.get(r.month)?.reimbursement_by_category?.[cat] ?? 0
                );
                const netVals = visible.map(
                  (r) => actualMap.get(r.month)?.expense_by_category?.[cat] ?? 0
                );
                const varianceVals = forecastVals.map((_, i) => {
                  const b = budgetVals[i];
                  const a = netVals[i];
                  return b === 0 || a === 0 ? 0 : a - b;
                });
                return (
                  <CategoryGroup
                    key={cat}
                    label={cat}
                    forecast={forecastVals}
                    budget={budgetVals}
                    gross={grossVals}
                    reimbursement={reimbVals}
                    actual={netVals}
                    variance={varianceVals}
                    linkBuilder={(_v, i) =>
                      txLink(workspaceId, visible[i].month, { category: cat })
                    }
                    reimbLinkBuilder={(_v, i) =>
                      txLink(workspaceId, visible[i].month, {
                        category: cat,
                        tx_type: "reimbursement",
                      })
                    }
                  />
                );
              })}

            {/* ── SAVINGS ── */}
            <Section label="SAVINGS" />
            <Row label="Net cash save (forecast)" values={visible.map((r) => r.net_cash_save)} bold />
            <Row
              label="↳ Budget"
              values={visible.map((r) => budgetMap.get(r.month)?.net_save_budget ?? 0)}
              muted
            />
            <Row
              label="↳ Actual (Income − Expense)"
              values={visible.map((r) => {
                const a = actualMap.get(r.month);
                return a ? a.income - a.expense : 0;
              })}
              muted
            />

            {/* ── ASSET BALANCES ── */}
            <SectionToggle
              label="ASSET BALANCES"
              expanded={expandAssets}
              onToggle={() => setExpandAssets((v) => !v)}
            />
            <Row label="Savings balance" values={visible.map((r) => r.saving_balance)} />
            <Row label="Condo value" values={visible.map((r) => r.condo_value)} />
            <Row label="Condo loan" values={visible.map((r) => r.condo_loan)} />
            <Row label="Equity" values={visible.map((r) => r.equity)} />
            <Row
              label="TOTAL NETWORTH (forecast)"
              values={visible.map((r) => r.total_networth)}
              bold
              highlight
            />
            <Row
              label="↳ Budget snapshot"
              values={visible.map((r) => budgetMap.get(r.month)?.total_networth_budget ?? 0)}
              muted
            />

            {expandAssets && (
              <>
                <tr className="bg-zinc-100 dark:bg-zinc-800/50">
                  <td
                    colSpan={1000}
                    className="px-3 py-1 text-[10px] uppercase tracking-wide text-zinc-500 sticky left-0 pl-6"
                  >
                    Asset breakdown
                  </td>
                </tr>
                <Row
                  label="  Savings"
                  values={visible.map((r) => r.saving_balance)}
                  muted
                />
                <Row
                  label="  Condo equity (value − loan)"
                  values={visible.map((r) => r.equity)}
                  muted
                />
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────

export function MarriageProjectionClient({
  workspaceId,
  initialConfig,
  actuals,
  savedBudgets: initialBudgets,
}: {
  workspaceId: string;
  initialConfig: MarriageProjectionConfig | null;
  actuals: ActualMonth[];
  savedBudgets: SavedBudgetMarriage[];
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<MarriageProjectionConfig>(
    initialConfig ?? defaultMarriageConfig()
  );
  const [budgets, setBudgets] = useState<SavedBudgetMarriage[]>(initialBudgets);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const rows = useMemo(() => projectMarriage(cfg), [cfg]);

  function update(fn: (c: MarriageProjectionConfig) => MarriageProjectionConfig) {
    setCfg((c) => fn(c));
    setMsg(null);
  }

  function updateLine(
    section: "income_lines" | "expense_lines",
    i: number,
    patch: Partial<ExpenseLine>
  ) {
    update((c) => {
      const lines = [...c[section]];
      lines[i] = { ...lines[i], ...patch };
      return { ...c, [section]: lines };
    });
  }

  function addLine(section: "income_lines" | "expense_lines") {
    update((c) => ({
      ...c,
      [section]: [...c[section], { label: "New line", monthly: 0 }],
    }));
  }

  function removeLine(section: "income_lines" | "expense_lines", i: number) {
    update((c) => ({
      ...c,
      [section]: c[section].filter((_, j) => j !== i),
    }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveProjectionConfig(workspaceId, cfg);
      if (res.error) setMsg(`Error: ${res.error}`);
      else {
        setMsg("Saved ✓");
        router.refresh();
      }
    });
  }

  function onSaveBudget() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveAsBudget(workspaceId, cfg);
      if (res.error) setMsg(`Error: ${res.error}`);
      else {
        setMsg(`Saved ${res.count} months as budget ✓`);
        setBudgets(
          rows.map((r) => ({
            month: r.month,
            income_budget: r.total_income,
            expense_budget: r.expenses,
            net_save_budget: r.net_cash_save,
            total_networth_budget: r.total_networth,
            expense_lines: r.expense_breakdown,
          }))
        );
      }
    });
  }

  function onClearBudget() {
    if (!confirm("Clear the saved budget for this workspace?")) return;
    setMsg(null);
    startTransition(async () => {
      const res = await clearBudget(workspaceId);
      if (res.error) setMsg(`Error: ${res.error}`);
      else {
        setMsg("Budget cleared");
        setBudgets([]);
      }
    });
  }

  return (
    <>
      {/* Budget actions bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        <button
          onClick={onSaveBudget}
          disabled={pending}
          className="px-3 py-1.5 rounded-lg bg-green-600 text-white disabled:opacity-50"
        >
          {pending ? "Saving..." : "💾 Save current projection as budget"}
        </button>
        {budgets.length > 0 && (
          <button
            onClick={onClearBudget}
            disabled={pending}
            className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-red-500"
          >
            Clear saved budget
          </button>
        )}
        <span className="text-zinc-500">
          {budgets.length > 0
            ? `${budgets.length} months saved as budget — actuals from ${actuals.length} months of transactions`
            : "No saved budget yet — save the projection to lock it as your baseline"}
        </span>
        {msg && (
          <span className={msg.startsWith("Error") ? "text-red-500" : "text-zinc-700 dark:text-zinc-300"}>
            {msg}
          </span>
        )}
      </div>

      {/* Settings panel */}
      <details className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 mb-6" open>
        <summary className="cursor-pointer text-sm font-medium text-zinc-500">
          ⚙️ Marriage projection settings
        </summary>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Horizon */}
          <div className="space-y-2">
            <h3 className="font-medium">Horizon</h3>
            <label className="flex justify-between items-center gap-2">
              Start month
              <input
                type="month"
                value={cfg.start_month}
                onChange={(e) => update((c) => ({ ...c, start_month: e.target.value }))}
                className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
              />
            </label>
            <label className="flex justify-between items-center gap-2">
              Months ahead
              <NumInput
                value={cfg.months}
                onChange={(n) => update((c) => ({ ...c, months: Math.max(1, Math.min(120, n)) }))}
              />
            </label>
          </div>

          {/* Growth rates */}
          <div className="space-y-2">
            <h3 className="font-medium">Annual growth rates (%)</h3>
            <label className="flex justify-between items-center gap-2">
              Savings
              <NumInput
                value={cfg.growth.savings_annual * 100}
                step="0.01"
                onChange={(n) =>
                  update((c) => ({ ...c, growth: { ...c.growth, savings_annual: n / 100 } }))
                }
              />
            </label>
            <label className="flex justify-between items-center gap-2">
              Condo
              <NumInput
                value={cfg.growth.condo_annual * 100}
                step="0.01"
                onChange={(n) =>
                  update((c) => ({ ...c, growth: { ...c.growth, condo_annual: n / 100 } }))
                }
              />
            </label>
          </div>

          {/* Starting balances */}
          <div className="space-y-2">
            <h3 className="font-medium">Starting balances</h3>
            <label className="flex justify-between items-center gap-2">
              Savings
              <NumInput
                value={cfg.starting.savings}
                onChange={(n) =>
                  update((c) => ({ ...c, starting: { ...c.starting, savings: n } }))
                }
              />
            </label>
            <label className="flex justify-between items-center gap-2">
              Condo value
              <NumInput
                value={cfg.starting.condo_value}
                onChange={(n) =>
                  update((c) => ({ ...c, starting: { ...c.starting, condo_value: n } }))
                }
              />
            </label>
            <label className="flex justify-between items-center gap-2">
              Condo loan
              <NumInput
                value={cfg.starting.condo_loan}
                onChange={(n) =>
                  update((c) => ({ ...c, starting: { ...c.starting, condo_loan: n } }))
                }
              />
            </label>
          </div>

          {/* Income lines */}
          <div className="space-y-2">
            <h3 className="font-medium">Income lines (monthly)</h3>
            {cfg.income_lines.map((line, i) => (
              <div key={i} className="space-y-1">
                <div className="flex gap-2 items-center">
                  <input
                    value={line.label}
                    onChange={(e) => updateLine("income_lines", i, { label: e.target.value })}
                    className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
                  />
                  <NumInput
                    value={line.monthly}
                    onChange={(n) => updateLine("income_lines", i, { monthly: n })}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine("income_lines", i)}
                    className="text-red-500 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
                <ScheduleEditor
                  label={line.label}
                  schedule={line.schedule ?? []}
                  onChange={(s) => updateLine("income_lines", i, { schedule: s })}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => addLine("income_lines")}
              className="text-xs text-green-600 hover:text-green-700"
            >
              + Add income line
            </button>
          </div>

          {/* Expense lines */}
          <div className="space-y-2 md:col-span-2">
            <h3 className="font-medium">Expense lines (monthly)</h3>
            {cfg.expense_lines.map((line, i) => (
              <div key={i} className="space-y-1">
                <div className="flex gap-2 items-center">
                  <input
                    value={line.label}
                    onChange={(e) => updateLine("expense_lines", i, { label: e.target.value })}
                    className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
                  />
                  <NumInput
                    value={line.monthly}
                    onChange={(n) => updateLine("expense_lines", i, { monthly: n })}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine("expense_lines", i)}
                    className="text-red-500 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
                <ScheduleEditor
                  label={line.label}
                  schedule={line.schedule ?? []}
                  onChange={(s) => updateLine("expense_lines", i, { schedule: s })}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => addLine("expense_lines")}
              className="text-xs text-green-600 hover:text-green-700"
            >
              + Add expense line
            </button>
          </div>

          {/* Save */}
          <div className="md:col-span-2 flex items-center gap-3 pt-2">
            <button
              onClick={onSave}
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save projection"}
            </button>
            {msg && (
              <span
                className={
                  msg.startsWith("Error") ? "text-red-500 text-xs" : "text-green-600 text-xs"
                }
              >
                {msg}
              </span>
            )}
          </div>
        </div>
      </details>

      {/* Forecast / Budget / Actual table */}
      <MarriageProjectionTable
        rows={rows}
        actuals={actuals}
        savedBudgets={budgets}
        workspaceId={workspaceId}
      />
    </>
  );
}
