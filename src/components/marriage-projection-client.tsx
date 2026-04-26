"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  defaultMarriageConfig,
  projectMarriage,
  type MarriageProjectionConfig,
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
};

export type SavedBudgetMarriage = {
  month: string;
  income_budget: number;
  expense_budget: number;
  net_save_budget: number;
  total_networth_budget: number;
};

// ── shared sub-components (same style as ProjectionSettings) ──────────────

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
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => projectMarriage(cfg), [cfg]);
  const visible = showAll ? rows : rows.slice(0, 12);

  const actualMap = new Map(actuals.map((a) => [a.month, a]));
  const budgetMap = new Map(budgets.map((b) => [b.month, b]));

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
      {/* Budget actions bar — mirrors personal projection */}
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
        {msg && <span className="text-zinc-700 dark:text-zinc-300">{msg}</span>}
      </div>

      {/* Settings panel — collapsible, same style as ProjectionSettings */}
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

          {/* Save button — same position as Personal */}
          <div className="md:col-span-2 flex items-center gap-3 pt-2">
            <button
              onClick={onSave}
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save projection"}
            </button>
            {msg && (
              <span className={msg.startsWith("Error") ? "text-red-500 text-xs" : "text-green-600 text-xs"}>
                {msg}
              </span>
            )}
          </div>
        </div>
      </details>

      {/* Forecast / Budget / Actual table */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-6 overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-medium">Forecast vs Budget vs Actual</h2>
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
              <Section label="INCOME" />
              <Row label="Forecast" values={visible.map((r) => r.total_income)} bold />
              <Row
                label="↳ Budget"
                values={visible.map((r) => budgetMap.get(r.month)?.income_budget ?? 0)}
                muted
              />
              <Row
                label="↳ Actual (transfers in + direct)"
                values={visible.map((r) => actualMap.get(r.month)?.income ?? 0)}
                muted
              />

              <Section label="EXPENSES" />
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
              />

              <Section label="SAVINGS" />
              <Row label="Net cash save" values={visible.map((r) => r.net_cash_save)} bold />
              <Row
                label="↳ Actual"
                values={visible.map((r) => {
                  const a = actualMap.get(r.month);
                  return a ? a.income - a.expense : 0;
                })}
                muted
              />

              <Section label="ASSET BALANCES" />
              <Row label="Savings" values={visible.map((r) => r.saving_balance)} />
              <Row label="Condo value" values={visible.map((r) => r.condo_value)} />
              <Row label="Condo loan" values={visible.map((r) => r.condo_loan)} />
              <Row label="Equity" values={visible.map((r) => r.equity)} />
              <Row
                label="TOTAL NETWORTH"
                values={visible.map((r) => r.total_networth)}
                bold
                highlight
              />
              <Row
                label="↳ Budget snapshot"
                values={visible.map(
                  (r) => budgetMap.get(r.month)?.total_networth_budget ?? 0
                )}
                muted
              />
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Section({ label }: { label: string }) {
  return (
    <tr className="bg-zinc-50 dark:bg-zinc-900">
      <td
        colSpan={1000}
        className="px-3 py-1.5 text-[10px] uppercase tracking-wide font-medium text-zinc-500 sticky left-0"
      >
        {label}
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
}: {
  label: string;
  values: number[];
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr
      className={
        "border-t border-zinc-200 dark:border-zinc-800 " +
        (highlight ? "bg-zinc-50 dark:bg-zinc-900 " : "") +
        (muted ? "text-zinc-400 dark:text-zinc-500 " : "") +
        (bold ? "font-medium " : "")
      }
    >
      <td className="px-3 py-1.5 sticky left-0 bg-white dark:bg-zinc-950 whitespace-nowrap">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="px-3 py-1.5 text-right whitespace-nowrap font-mono tabular-nums">
          {v === 0 ? "—" : fmt(v)}
        </td>
      ))}
    </tr>
  );
}
