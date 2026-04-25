"use client";

import { useMemo, useState } from "react";
import { project, type ProjectionConfig, type MonthRow } from "@/lib/projection";
import { ProjectionSettings } from "./projection-settings";
import { ProjectionTable } from "./projection-table";
import { NetworthChart, CashFlowChart } from "./projection-charts";

export function ProjectionPageClient({
  workspaceId,
  initialConfig,
  actuals,
  startingNetworth,
}: {
  workspaceId: string;
  initialConfig: ProjectionConfig;
  actuals: { month: string; income: number; expense: number }[];
  startingNetworth: number;
}) {
  const [cfg, setCfg] = useState<ProjectionConfig>(initialConfig);
  const rows: MonthRow[] = useMemo(() => project(cfg), [cfg]);

  // Build a "running actual networth" approximation using cumulative net cash flow
  // anchored at startingNetworth, restricted to months the user has transactions for.
  const actualsByMonth = new Map(actuals.map((a) => [a.month, a]));
  const actualNetworth: { month: string; total: number }[] = [];
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
      <ProjectionSettings
        workspaceId={workspaceId}
        initial={initialConfig}
        onSaved={(saved) => setCfg(saved)}
      />
      <NetworthChart rows={rows} actuals={actualNetworth} />
      <CashFlowChart rows={rows} actuals={actuals} />
      <ProjectionTable rows={rows} actuals={actuals} />
    </>
  );
}
