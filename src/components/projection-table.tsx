"use client";

import { useState } from "react";
import Link from "next/link";
import type { MonthRow } from "@/lib/projection";

const fmt = (n: number) =>
  Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

type ActualMonth = {
  month: string;
  income: number;
  expense: number;
  expense_by_category?: Record<string, number>;
};
export type SavedBudget = {
  month: string; // YYYY-MM
  income_budget: number;
  expense_budget: number;
  net_save_budget: number;
  total_networth_budget: number;
  expense_lines?: { label: string; amount: number }[];
};

function monthRange(month: string): { from: string; to: string } {
  // month = "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  // last day of month
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

export function ProjectionTable({
  rows,
  actuals,
  savedBudgets,
  workspaceId,
}: {
  rows: MonthRow[];
  actuals: ActualMonth[];
  savedBudgets: SavedBudget[];
  workspaceId: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expandExpenses, setExpandExpenses] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 12);

  const actualMap = new Map(actuals.map((a) => [a.month, a]));
  const budgetMap = new Map(savedBudgets.map((b) => [b.month, b]));

  // Collect all expense category labels we know about (forecast + budget + actual)
  const allCategories = new Set<string>();
  for (const r of visible) for (const e of r.expense_breakdown) allCategories.add(e.label);
  for (const b of savedBudgets) for (const l of b.expense_lines ?? []) allCategories.add(l.label);
  for (const a of actuals)
    if (a.expense_by_category) for (const k of Object.keys(a.expense_by_category)) allCategories.add(k);
  const categories = Array.from(allCategories).sort();

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6">
      <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-500">
          Forecast vs Budget vs Actual
        </h2>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {showAll ? `Show first 12` : `Show all ${rows.length}`}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
            <tr>
              <th className="px-3 py-2 sticky left-0 bg-zinc-50 dark:bg-zinc-900 z-10">
                Line
              </th>
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
                    budgetMap.get(r.month)?.expense_lines?.find((l) => l.label === cat)?.amount ??
                    0
                );
                const actualVals = visible.map(
                  (r) => actualMap.get(r.month)?.expense_by_category?.[cat] ?? 0
                );
                const varianceVals = forecastVals.map((_, i) => {
                  const b = budgetVals[i];
                  const a = actualVals[i];
                  return b === 0 || a === 0 ? 0 : a - b;
                });
                return (
                  <CategoryGroup
                    key={cat}
                    label={cat}
                    forecast={forecastVals}
                    budget={budgetVals}
                    actual={actualVals}
                    variance={varianceVals}
                    linkBuilder={(i) => txLink(workspaceId, visible[i].month, { category: cat })}
                  />
                );
              })}

            <Section label="DEDUCTIONS" />
            <Row label="SSO" values={visible.map((r) => r.sso)} />
            <Row label="Provident" values={visible.map((r) => r.provident)} />
            <Row label="Employer match" values={visible.map((r) => r.employer)} />
            <Row label="Tax" values={visible.map((r) => r.tax)} />
            <Row label="Net pay" values={visible.map((r) => r.net_pay)} bold />

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
            <Row label="Net stock save" values={visible.map((r) => r.net_stock_save)} />
            <Row
              label="Saving rate %"
              values={visible.map((r) => r.saving_rate * 100)}
              percent
            />

            <Section label="ASSET BALANCES (forecast end of month)" />
            <Row label="Saving" values={visible.map((r) => r.saving_balance)} />
            <Row label="Stock" values={visible.map((r) => r.stock_balance)} />
            <Row label="PVD" values={visible.map((r) => r.pvd_balance)} />
            <Row label="SSF+RMF" values={visible.map((r) => r.ssf_rmf_balance)} />
            <Row
              label="TOTAL NETWORTH (forecast)"
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
  );
}

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

function CategoryGroup({
  label,
  forecast,
  budget,
  actual,
  variance,
  linkBuilder,
}: {
  label: string;
  forecast: number[];
  budget: number[];
  actual: number[];
  variance: number[];
  linkBuilder: (i: number) => string;
}) {
  // % of budget used per month (Actual / Budget)
  const pctOfBudget = actual.map((a, i) => (budget[i] > 0 ? (a / budget[i]) * 100 : 0));
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
      <Row label="↳ Actual" values={actual} muted linkBuilder={linkBuilder} />
      <Row label="↳ % of budget" values={pctOfBudget} muted percent />
      <Row label="↳ Variance" values={variance} muted variance />
    </>
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
