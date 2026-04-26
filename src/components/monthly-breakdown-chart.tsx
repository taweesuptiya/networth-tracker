"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { MonthRow } from "@/lib/projection";

const fmt = (n: number) =>
  Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

// Distinct, non-cliché palette — Thai-ledger toned
const PALETTE = [
  "#7A1B2C", // oxblood
  "#1F4A38", // jade
  "#C9A14E", // mustard
  "#3F6184", // slate blue
  "#A05A2C", // burnt sienna
  "#5C4670", // aubergine
  "#7E8C5F", // moss
  "#B36B5E", // terracotta
  "#3D7A8D", // teal
  "#8F6E3A", // bronze
];

const colorFor = (i: number) => PALETTE[i % PALETTE.length];

type ActualMonth = {
  month: string;
  income: number;
  expense: number;
  expense_by_category?: Record<string, number>;
};

type SavedBudget = {
  month: string;
  income_budget: number;
  expense_budget: number;
  expense_lines?: { label: string; amount: number }[];
};

export function MonthlyBreakdownChart({
  rows,
  actuals,
  savedBudgets,
}: {
  rows: MonthRow[];
  actuals: ActualMonth[];
  savedBudgets: SavedBudget[];
}) {
  // Show last 12 months with actual data + 6 future projection months for context
  const visibleRows = useMemo(() => rows.slice(0, 18), [rows]);

  // Determine top-N expense categories across the visible window (rest rolled into "Other")
  const [topN, setTopN] = useState(6);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of visibleRows) {
      for (const e of r.expense_breakdown) {
        totals.set(e.label, (totals.get(e.label) ?? 0) + e.amount);
      }
      const a = actuals.find((x) => x.month === r.month);
      if (a?.expense_by_category) {
        for (const [k, v] of Object.entries(a.expense_by_category)) {
          totals.set(k, (totals.get(k) ?? 0) + v);
        }
      }
    }
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [visibleRows, actuals]);

  const topCats = useMemo(
    () => categoryTotals.slice(0, topN).map(([label]) => label),
    [categoryTotals, topN]
  );
  const allCats = useMemo(() => categoryTotals.map(([l]) => l), [categoryTotals]);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    [...topCats, "Other"].forEach((cat, i) => m.set(cat, colorFor(i)));
    return m;
  }, [topCats]);

  // Build chart rows
  const data = useMemo(() => {
    const actualMap = new Map(actuals.map((a) => [a.month, a]));
    const budgetMap = new Map(savedBudgets.map((b) => [b.month, b]));
    return visibleRows.map((r) => {
      const a = actualMap.get(r.month);
      const b = budgetMap.get(r.month);
      const row: Record<string, number | string | null> = {
        month: r.month.slice(2), // YY-MM looks tighter on x-axis
        fullMonth: r.month,
      };

      // Actual stack
      const actualBy = a?.expense_by_category ?? {};
      let actualOther = 0;
      for (const cat of allCats) {
        const v = actualBy[cat] ?? 0;
        if (topCats.includes(cat)) row[`A · ${cat}`] = v;
        else actualOther += v;
      }
      row["A · Other"] = actualOther;
      row["Income (actual)"] = a?.income ?? null;

      // Budget stack — prefer saved snapshot, fall back to live forecast
      const budgetLines = b?.expense_lines ?? r.expense_breakdown.map((e) => ({ label: e.label, amount: e.amount }));
      let budgetOther = 0;
      for (const cat of allCats) {
        const found = budgetLines.find((l) => l.label === cat);
        const v = found?.amount ?? 0;
        if (topCats.includes(cat)) row[`B · ${cat}`] = v;
        else budgetOther += v;
      }
      row["B · Other"] = budgetOther;
      row["Income (budget)"] = b?.income_budget ?? r.total_income;

      return row;
    });
  }, [visibleRows, actuals, savedBudgets, allCats, topCats]);

  const seriesCats = [...topCats, "Other"];

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-6 overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="display italic text-lg leading-none">Income vs expense, monthly</h2>
          <p className="text-xs text-ink-faint mt-1">
            Each month: <span className="text-ink">Actual</span> bar (left, full color) ·{" "}
            <span className="text-ink-subtle">Budget</span> bar (right, faded) · stacked by category.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-subtle">
          <span>Categories shown:</span>
          <button
            className="px-2 py-1 rounded border hover:bg-paper-darker disabled:opacity-40"
            onClick={() => setTopN(Math.max(2, topN - 1))}
            disabled={topN <= 2}
          >
            −
          </button>
          <span className="font-mono w-6 text-center">{topN}</span>
          <button
            className="px-2 py-1 rounded border hover:bg-paper-darker disabled:opacity-40"
            onClick={() => setTopN(Math.min(allCats.length, topN + 1))}
            disabled={topN >= allCats.length}
          >
            +
          </button>
        </div>
      </div>

      <div className="px-2 py-4 h-96">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap={"18%"}>
            <CartesianGrid strokeDasharray="2 4" stroke="#00000010" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fontFamily: "var(--font-mono-stack)" }}
            />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
            <ReferenceLine y={0} stroke="#00000033" />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Tooltip
              content={((props: any) => (
                <BreakdownTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label}
                  topCats={topCats}
                  colorMap={colorMap}
                />
              )) as never}
            />

            {/* Actual stack — solid */}
            {seriesCats.map((cat) => (
              <Bar
                key={`A-${cat}`}
                dataKey={`A · ${cat}`}
                stackId="actual"
                fill={colorMap.get(cat) ?? "#999"}
                radius={[0, 0, 0, 0]}
              />
            ))}
            {/* Budget stack — faded, side-by-side */}
            {seriesCats.map((cat) => (
              <Bar
                key={`B-${cat}`}
                dataKey={`B · ${cat}`}
                stackId="budget"
                fill={colorMap.get(cat) ?? "#999"}
                fillOpacity={0.35}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="px-6 pb-5 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        {seriesCats.map((cat) => (
          <div key={cat} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3"
              style={{ backgroundColor: colorMap.get(cat) }}
            />
            <span>{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownTooltip({
  active,
  payload,
  label,
  topCats,
  colorMap,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, number | string | null> }>;
  label?: string;
  topCats: string[];
  colorMap: Map<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as Record<string, number | string | null>;
  const fullMonth = (data.fullMonth as string) ?? label;

  // Pull category values from the row
  const cats = [...topCats, "Other"];
  const actuals = cats.map((c) => ({
    label: c,
    value: Number(data[`A · ${c}`] ?? 0),
  }));
  const budgets = cats.map((c) => ({
    label: c,
    value: Number(data[`B · ${c}`] ?? 0),
  }));
  const totalActual = actuals.reduce((s, x) => s + x.value, 0);
  const totalBudget = budgets.reduce((s, x) => s + x.value, 0);
  const incomeActual = Number(data["Income (actual)"] ?? 0);
  const incomeBudget = Number(data["Income (budget)"] ?? 0);

  return (
    <div className="bg-paper border rounded shadow-lg p-3 text-xs min-w-72">
      <div className="font-medium mb-2 display italic text-base">{fullMonth}</div>

      <div className="grid grid-cols-3 gap-x-3 mb-2 pb-2 border-b">
        <div></div>
        <div className="text-right text-[10px] uppercase tracking-wider text-ink-faint">
          Actual
        </div>
        <div className="text-right text-[10px] uppercase tracking-wider text-ink-faint">
          Budget
        </div>
      </div>

      {incomeActual > 0 || incomeBudget > 0 ? (
        <div className="grid grid-cols-3 gap-x-3 mb-1 text-jade-bright">
          <span>Income</span>
          <span className="text-right font-mono tabular">
            {incomeActual ? `+${fmt(incomeActual)}` : "—"}
          </span>
          <span className="text-right font-mono tabular text-ink-subtle">
            {incomeBudget ? `+${fmt(incomeBudget)}` : "—"}
          </span>
        </div>
      ) : null}

      <div className="text-[10px] uppercase tracking-wider text-ink-faint mt-2 mb-1">
        Expenses by category
      </div>
      {cats.map((cat) => {
        const a = actuals.find((x) => x.label === cat)?.value ?? 0;
        const b = budgets.find((x) => x.label === cat)?.value ?? 0;
        if (a === 0 && b === 0) return null;
        const overActual = a > b && b > 0;
        return (
          <div key={cat} className="grid grid-cols-3 gap-x-3 py-0.5">
            <div className="flex items-center gap-1.5 truncate">
              <span
                className="inline-block w-2 h-2 shrink-0"
                style={{ backgroundColor: colorMap.get(cat) }}
              />
              <span className="truncate">{cat}</span>
            </div>
            <span
              className={
                "text-right font-mono tabular " + (overActual ? "text-oxblood" : "")
              }
            >
              {a > 0 ? fmt(a) : "—"}
            </span>
            <span className="text-right font-mono tabular text-ink-subtle">
              {b > 0 ? fmt(b) : "—"}
            </span>
          </div>
        );
      })}

      <div className="grid grid-cols-3 gap-x-3 mt-2 pt-2 border-t font-medium">
        <span>Total expense</span>
        <span className="text-right font-mono tabular text-oxblood-bright">
          −{fmt(totalActual)}
        </span>
        <span className="text-right font-mono tabular text-ink-subtle">
          −{fmt(totalBudget)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 mt-1">
        <span>Net</span>
        <span
          className={
            "text-right font-mono tabular " +
            (incomeActual - totalActual >= 0 ? "text-jade-bright" : "text-oxblood-bright")
          }
        >
          {incomeActual - totalActual >= 0 ? "+" : "−"}
          {fmt(Math.abs(incomeActual - totalActual))}
        </span>
        <span className="text-right font-mono tabular text-ink-subtle">
          {incomeBudget - totalBudget >= 0 ? "+" : "−"}
          {fmt(Math.abs(incomeBudget - totalBudget))}
        </span>
      </div>
    </div>
  );
}
