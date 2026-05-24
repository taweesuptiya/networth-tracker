"use client";

import { useMemo, useState, useTransition } from "react";
import { project, type ProjectionConfig, type MonthRow } from "@/lib/projection";
import { ProjectionSettings } from "./projection-settings";
import { ProjectionTable, type SavedBudget } from "./projection-table";
import { saveAsBudget, clearBudget } from "@/app/actions/projection";

export type AssetMonthValues = Record<
  string,
  { type: string; values: Record<string, number> }
>;

export function ProjectionPageClient({
  workspaceId,
  initialConfig,
  actuals,
  savedBudgets,
  startingNetworth,
  actualSavingsBalance,
  assetMonthValues,
}: {
  workspaceId: string;
  initialConfig: ProjectionConfig;
  actuals: {
    month: string;
    income: number;
    expense: number;
    expense_by_category?: Record<string, number>;
    gross_expense_by_category?: Record<string, number>;
    reimbursement_by_category?: Record<string, number>;
  }[];
  savedBudgets: SavedBudget[];
  startingNetworth: number;
  /** Current sum of savings-type assets — used as anchor for actual-savings back-propagation */
  actualSavingsBalance?: number;
  assetMonthValues: AssetMonthValues;
}) {
  const [cfg, setCfg] = useState<ProjectionConfig>(initialConfig);
  const [budgets, setBudgets] = useState<SavedBudget[]>(savedBudgets);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const rows: MonthRow[] = useMemo(() => project(cfg), [cfg]);

  function onSaveBudget() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveAsBudget(workspaceId, cfg);
      if (res.error) setMsg(`Error: ${res.error}`);
      else {
        setMsg(`Saved ${res.count} months as budget ✓`);
        // Reflect locally so the table updates without a page reload
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

  // Build a "running actual networth" using cumulative net cash flow anchored at startingNetworth.
  // Also build per-month "actual saving balance" so the asset table can reflect real income-expense.
  const actualsByMonth = new Map(actuals.map((a) => [a.month, a]));
  const actualNetworth: { month: string; total: number }[] = [];
  const actualSavingByMonth = new Map<string, number>();

  // Collect sorted months that have actual data
  const actualMonths = actuals.map((a) => a.month).sort();

  if (actualSavingsBalance != null && actualSavingsBalance > 0 && actualMonths.length > 0) {
    // Back-propagate from current savings asset balance (most accurate anchor).
    // Today's balance is anchored to the latest actual month.
    // Going backwards: balance_at_prev_month = balance_at_this_month - (income - expense) for this month.
    let balance = actualSavingsBalance;
    for (let i = actualMonths.length - 1; i >= 0; i--) {
      const m = actualMonths[i];
      actualSavingByMonth.set(m, balance);
      if (i > 0) {
        const a = actualsByMonth.get(m)!;
        balance = balance - (a.income - a.expense);
      }
    }
  } else {
    // Fallback: forward-propagate from manually-configured starting savings
    let runningSaving = initialConfig.starting.savings;
    for (const r of rows) {
      const a = actualsByMonth.get(r.month);
      if (a) {
        runningSaving += a.income - a.expense;
        actualSavingByMonth.set(r.month, runningSaving);
      }
    }
  }

  // Running actual networth (always forward-propagated from startingNetworth)
  let runningActual = startingNetworth;
  for (const r of rows) {
    const a = actualsByMonth.get(r.month);
    if (a) {
      runningActual += a.income - a.expense;
      actualNetworth.push({ month: r.month, total: runningActual });
    }
  }

  return (
    <>
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
            : `No saved budget yet — save the projection to lock it as your baseline`}
        </span>
        {msg && <span className="text-zinc-700 dark:text-zinc-300">{msg}</span>}
      </div>

      <ProjectionSettings
        workspaceId={workspaceId}
        initial={initialConfig}
        onSaved={(saved) => setCfg(saved)}
      />
      <p className="text-xs text-ink-subtle mb-4 italic">
        Charts moved to <a href="/" className="underline">Dashboard</a>. Settings and the
        forecast/budget/actual table remain here.
      </p>
      <ProjectionTable
        rows={rows}
        actuals={actuals}
        savedBudgets={budgets}
        workspaceId={workspaceId}
        actualSavingByMonth={Object.fromEntries(actualSavingByMonth)}
        assetMonthValues={assetMonthValues}
      />
    </>
  );
}
