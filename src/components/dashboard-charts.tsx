"use client";

import type { MonthRow } from "@/lib/projection";
import type { SavedBudget } from "./projection-table";
import { NetworthChart } from "./projection-charts";
import { MonthlyBreakdownChart } from "./monthly-breakdown-chart";

export function DashboardCharts({
  rows,
  actuals,
  savedBudgets,
  actualNetworth,
}: {
  rows: MonthRow[];
  actuals: {
    month: string;
    income: number;
    expense: number;
    expense_by_category?: Record<string, number>;
  }[];
  savedBudgets: SavedBudget[];
  actualNetworth: { month: string; total: number }[];
}) {
  return (
    <>
      <NetworthChart rows={rows} actuals={actualNetworth} />
      <MonthlyBreakdownChart rows={rows} actuals={actuals} savedBudgets={savedBudgets} />
    </>
  );
}
