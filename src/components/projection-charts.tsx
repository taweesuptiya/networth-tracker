"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import type { MonthRow } from "@/lib/projection";

const fmt = (n: number) =>
  Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export function NetworthChart({
  rows,
  actuals,
}: {
  rows: MonthRow[];
  actuals?: { month: string; total: number }[];
}) {
  const data = rows.map((r) => {
    const a = actuals?.find((x) => x.month === r.month);
    return {
      month: r.month,
      Projected: Math.round(r.total_networth),
      Actual: a ? Math.round(a.total) : null,
    };
  });
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-4">Total Net Worth (projected)</h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={Math.floor(rows.length / 12)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <Line type="monotone" dataKey="Projected" stroke="#3b82f6" strokeWidth={2} dot={false} />
            {actuals && actuals.length > 0 && (
              <Line type="monotone" dataKey="Actual" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CashFlowChart({
  rows,
  actuals,
}: {
  rows: MonthRow[];
  actuals?: { month: string; income: number; expense: number }[];
}) {
  const data = rows.map((r) => {
    const a = actuals?.find((x) => x.month === r.month);
    return {
      month: r.month,
      "Budget income": Math.round(r.total_income),
      "Budget expense": Math.round(r.expenses),
      "Actual income": a ? Math.round(a.income) : null,
      "Actual expense": a ? Math.round(a.expense) : null,
    };
  });
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-4">Income vs Expense (monthly)</h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} interval={Math.floor(rows.length / 12)} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
            <Tooltip formatter={(v) => (v == null ? "—" : fmt(Number(v)))} />
            <Legend />
            <Bar dataKey="Budget income" fill="#3b82f6" />
            <Bar dataKey="Budget expense" fill="#ef4444" />
            {actuals && actuals.length > 0 && <Bar dataKey="Actual income" fill="#10b981" />}
            {actuals && actuals.length > 0 && <Bar dataKey="Actual expense" fill="#f59e0b" />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
