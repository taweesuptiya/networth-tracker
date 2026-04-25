"use client";

import { useState } from "react";
import type { MonthRow } from "@/lib/projection";

const fmt = (n: number) =>
  Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

type ActualMonth = {
  month: string;
  income: number;
  expense: number;
};

export function ProjectionTable({
  rows,
  actuals,
}: {
  rows: MonthRow[];
  actuals: ActualMonth[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 12);

  function actualFor(month: string) {
    return actuals.find((a) => a.month === month);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-6">
      <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-500">Monthly projection vs actuals</h2>
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
            <Row
              label="Salary"
              values={visible.map((r) => r.salary)}
            />
            <Row label="RSU" values={visible.map((r) => r.rsu)} />
            <Row label="Bonus stock" values={visible.map((r) => r.bonus_stock)} />
            <Row label="Bonus cash" values={visible.map((r) => r.bonus_cash)} />
            <Row label="Total income" values={visible.map((r) => r.total_income)} bold />
            <Row
              label="↳ Actual income"
              values={visible.map((r) => actualFor(r.month)?.income ?? 0)}
              muted
            />

            <Section label="DEDUCTIONS" />
            <Row label="SSO" values={visible.map((r) => r.sso)} />
            <Row label="Provident" values={visible.map((r) => r.provident)} />
            <Row label="Employer match" values={visible.map((r) => r.employer)} />
            <Row label="Tax" values={visible.map((r) => r.tax)} />
            <Row label="RMF+ESG" values={visible.map((r) => r.rmf_esg)} />
            <Row label="Net pay" values={visible.map((r) => r.net_pay)} bold />

            <Section label="EXPENSES" />
            <Row label="Fixed expenses" values={visible.map((r) => r.expenses)} />
            <Row
              label="↳ Actual expenses"
              values={visible.map((r) => actualFor(r.month)?.expense ?? 0)}
              muted
            />
            <Row
              label="↳ Variance"
              values={visible.map((r) => {
                const a = actualFor(r.month);
                if (!a) return 0;
                return a.expense - r.expenses;
              })}
              muted
              variance
            />

            <Section label="SAVINGS" />
            <Row label="Net cash save" values={visible.map((r) => r.net_cash_save)} bold />
            <Row label="Net stock save" values={visible.map((r) => r.net_stock_save)} />
            <Row label="Saving rate %" values={visible.map((r) => r.saving_rate * 100)} percent />

            <Section label="ASSET BALANCES (end of month)" />
            <Row label="Saving" values={visible.map((r) => r.saving_balance)} />
            <Row label="Stock" values={visible.map((r) => r.stock_balance)} />
            <Row label="PVD" values={visible.map((r) => r.pvd_balance)} />
            <Row label="SSF+RMF" values={visible.map((r) => r.ssf_rmf_balance)} />
            <Row label="Marriage" values={visible.map((r) => r.marriage_balance)} />
            <Row
              label="TOTAL NETWORTH"
              values={visible.map((r) => r.total_networth)}
              bold
              highlight
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
      <td colSpan={1000} className="px-3 py-1.5 text-[10px] uppercase tracking-wide font-medium text-zinc-500 sticky left-0">
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
  percent,
  variance,
}: {
  label: string;
  values: number[];
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
  percent?: boolean;
  variance?: boolean;
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
      <td className="px-3 py-1.5 sticky left-0 bg-white dark:bg-zinc-950 whitespace-nowrap">{label}</td>
      {values.map((v, i) => {
        let cls = "px-3 py-1.5 text-right whitespace-nowrap ";
        if (variance) cls += v > 0 ? "text-red-500 " : v < 0 ? "text-green-600 " : "";
        return (
          <td key={i} className={cls}>
            {percent ? `${v.toFixed(1)}%` : v === 0 ? "—" : (variance && v > 0 ? "+" : "") + fmt(v)}
          </td>
        );
      })}
    </tr>
  );
}
