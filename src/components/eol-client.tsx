"use client";

import { useState, useMemo, useTransition } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  calculateEol,
  DEFAULT_EOL_SETTINGS,
  type EolConfig,
  type EolRowInput,
  type EolCalcRow,
} from "@/lib/eol-projection";
import { saveEolConfig } from "@/app/actions/eol";

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

const SETTINGS_FIELDS: { key: keyof typeof DEFAULT_EOL_SETTINGS; label: string; step?: number }[] = [
  { key: "birthYear", label: "Birth year", step: 1 },
  { key: "startYear", label: "Start year", step: 1 },
  { key: "endAge", label: "End age", step: 1 },
  { key: "startNW", label: "Starting NW", step: 100000 },
  { key: "startLiabilities", label: "Liabilities", step: 100000 },
  { key: "annualLiabPayment", label: "Annual liab payment", step: 10000 },
  { key: "returnRate", label: "Investment return %", step: 0.5 },
  { key: "liabRate", label: "Liabilities rate %", step: 0.05 },
  { key: "defaultTaxRate", label: "Tax rate %", step: 1 },
  { key: "defaultMonthlyCoL", label: "Monthly CoL", step: 5000 },
  { key: "colGrowthRate", label: "CoL growth % / yr", step: 0.5 },
];

const ROW_COLS: { key: keyof EolRowInput; label: string; type?: "text" | "number"; step?: number; width?: string }[] = [
  { key: "event", label: "Event", type: "text", width: "120px" },
  { key: "company", label: "Company", type: "text", width: "100px" },
  { key: "monthlySalary", label: "Monthly salary", step: 5000, width: "110px" },
  { key: "salaryGrowthPct", label: "Salary +%", step: 1, width: "80px" },
  { key: "cashBonus", label: "Cash bonus", step: 10000, width: "100px" },
  { key: "sharesVested", label: "# Shares", step: 100, width: "90px" },
  { key: "sharePrice", label: "Share price", step: 1, width: "90px" },
  { key: "monthlyColOverride", label: "Monthly CoL", step: 5000, width: "100px" },
];

export function EolClient({
  workspaceId,
  initialConfig,
  currency,
}: {
  workspaceId: string;
  initialConfig: EolConfig;
  currency: string;
}) {
  const [settings, setSettings] = useState<EolConfig>(initialConfig);
  const [rows, setRows] = useState<EolRowInput[]>(initialConfig.rows);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const calc = useMemo<EolCalcRow[]>(() => {
    const endYear = settings.birthYear + settings.endAge;
    const trimmed = rows.filter((r) => r.year <= endYear);
    return calculateEol({ ...settings, rows: trimmed });
  }, [settings, rows]);

  const peakNW = Math.max(...calc.map((r) => r.netWorth));
  const finalNW = calc[calc.length - 1]?.netWorth ?? 0;
  const fireAge = calc.find((r) => r.passivePct >= 100)?.age ?? null;

  function updateRow(idx: number, key: keyof EolRowInput, val: string | number | undefined) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      return next;
    });
    setSaved(false);
  }

  function updateSetting(key: keyof EolConfig, val: number) {
    setSettings((prev) => {
      const next = { ...prev, [key]: val };
      // Rebuild rows if year range changes
      if (key === "startYear" || key === "endAge" || key === "birthYear") {
        const endYear = next.birthYear + next.endAge;
        const existing = new Map(rows.map((r) => [r.year, r]));
        const newRows: EolRowInput[] = [];
        for (let y = next.startYear; y <= endYear; y++) {
          newRows.push(
            existing.get(y) ?? {
              year: y,
              monthlySalary: 0,
              salaryGrowthPct: 0,
              cashBonus: 0,
              sharesVested: 0,
              sharePrice: 0,
            }
          );
        }
        setRows(newRows);
      }
      return next;
    });
    setSaved(false);
  }

  function onSave() {
    setSaved(false);
    startTransition(async () => {
      const res = await saveEolConfig(workspaceId, { ...settings, rows });
      if (!res.error) setSaved(true);
    });
  }

  const chartData = calc.map((r) => ({
    year: r.year,
    age: r.age,
    nw: Math.round(r.netWorth / 1_000_000 * 10) / 10,
    passive: Math.round(r.passivePct),
  }));

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Peak NW", value: fmt(peakNW) + " " + currency },
          { label: "Final NW (age " + settings.endAge + ")", value: fmt(finalNW) + " " + currency },
          { label: "FIRE age (100% passive)", value: fireAge ? String(fireAge) : "—" },
          { label: "Years to FIRE", value: fireAge ? String(fireAge - (new Date().getFullYear() - settings.birthYear)) : "—" },
        ].map((k) => (
          <div key={k.label} className="card-surface rounded-2xl p-4">
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 mb-1">{k.label}</div>
            <div className="text-xl font-semibold">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="card-surface rounded-2xl p-4">
        <div className="text-sm font-medium mb-3">Net worth trajectory (M {currency})</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v + "M"} />
            <Tooltip
              formatter={(val, name) =>
                name === "nw"
                  ? [Number(val).toFixed(1) + "M " + currency, "Net Worth"]
                  : [Number(val).toFixed(0) + "%", "Passive %"]
              }
              labelFormatter={(label) => {
                const row = calc.find((r) => r.year === Number(label));
                return `${label} (age ${row?.age ?? ""})`;
              }}
            />
            {fireAge !== null && (
              <ReferenceLine
                x={fireAge + settings.birthYear}
                stroke="#22c55e"
                strokeDasharray="4 4"
                label="FIRE"
              />
            )}
            <Line type="monotone" dataKey="nw" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Settings toggle */}
      <div className="card-surface rounded-2xl">
        <button
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium"
          onClick={() => setSettingsOpen((o) => !o)}
        >
          <span>Global settings</span>
          <span className="text-zinc-400 text-xs">{settingsOpen ? "▲ collapse" : "▼ expand"}</span>
        </button>
        {settingsOpen && (
          <div className="px-5 pb-5 border-t pt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {SETTINGS_FIELDS.map(({ key, label, step }) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-[11px] text-zinc-500">{label}</span>
                  <input
                    type="number"
                    step={step ?? 1}
                    value={(settings as unknown as Record<string, number>)[key]}
                    onChange={(e) => updateSetting(key, parseFloat(e.target.value) || 0)}
                    className="rounded border border-zinc-200 dark:border-zinc-700 bg-transparent px-2 py-1.5 text-sm w-full"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              {saved && <span className="text-xs text-green-600">Saved ✓</span>}
              <button
                onClick={onSave}
                disabled={pending}
                className="px-3 py-1.5 text-xs rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Year table */}
      <div className="card-surface rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Year-by-year inputs & projections</div>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-green-600">Saved ✓</span>}
            <button
              onClick={onSave}
              disabled={pending}
              className="px-3 py-1.5 text-xs rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap sticky left-0 bg-white dark:bg-zinc-900 z-10">Year</th>
                <th className="text-left py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">Age</th>
                {ROW_COLS.map((c) => (
                  <th key={c.key} className="text-left py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">{c.label}</th>
                ))}
                <th className="text-right py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">Active</th>
                <th className="text-right py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">Passive</th>
                <th className="text-right py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">% Passive</th>
                <th className="text-right py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">Total</th>
                <th className="text-right py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">Tax</th>
                <th className="text-right py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">After tax</th>
                <th className="text-right py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">CoL</th>
                <th className="text-right py-1.5 pr-3 font-medium text-zinc-500 whitespace-nowrap">Savings</th>
                <th className="text-right py-1.5 font-medium text-zinc-500 whitespace-nowrap">Net Worth</th>
              </tr>
            </thead>
            <tbody>
              {calc.map((row, idx) => {
                const isFireYear = fireAge === row.age;
                return (
                  <tr
                    key={row.year}
                    className={
                      "border-b transition-colors " +
                      (isFireYear
                        ? "bg-green-50 dark:bg-green-950/30"
                        : idx % 2 === 0
                        ? "bg-transparent"
                        : "bg-zinc-50/50 dark:bg-zinc-800/20")
                    }
                  >
                    <td className="py-1 pr-3 font-mono tabular-nums sticky left-0 bg-inherit z-10">{row.year}</td>
                    <td className="py-1 pr-3 font-mono tabular-nums text-zinc-500">{row.age}</td>

                    {/* Editable input cells */}
                    {ROW_COLS.map((col) => (
                      <td key={col.key} className="py-0.5 pr-2" style={{ minWidth: col.width }}>
                        <input
                          type={col.type === "text" ? "text" : "number"}
                          step={col.step ?? 1}
                          value={
                            col.key === "monthlyColOverride"
                              ? (rows[idx]?.monthlyColOverride ?? "")
                              : (rows[idx]?.[col.key] ?? "")
                          }
                          placeholder={col.type === "text" ? "" : col.key === "monthlyColOverride" ? String(Math.round(settings.defaultMonthlyCoL)) : "0"}
                          onChange={(e) => {
                            const v: string | number | undefined =
                              col.type === "text"
                                ? e.target.value
                                : col.key === "monthlyColOverride"
                                ? e.target.value === "" ? undefined : parseFloat(e.target.value) || 0
                                : parseFloat(e.target.value) || 0;
                            updateRow(idx, col.key, v);
                          }}
                          className="w-full rounded border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-zinc-400 dark:focus:border-zinc-500 bg-transparent px-1.5 py-0.5 text-xs font-mono outline-none transition-colors"
                        />
                      </td>
                    ))}

                    {/* Calculated cells */}
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{fmt(row.activeIncome)}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums text-zinc-500">{fmt(row.passiveIncome)}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums text-zinc-500">{row.passivePct.toFixed(0)}%</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{fmt(row.totalIncome)}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums text-red-500">-{fmt(row.tax)}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums">{fmt(row.afterTax)}</td>
                    <td className="py-1 pr-3 text-right font-mono tabular-nums text-red-500">-{fmt(row.annualCoL)}</td>
                    <td className={"py-1 pr-3 text-right font-mono tabular-nums " + (row.savings < 0 ? "text-red-500" : "text-green-600")}>{fmt(row.savings)}</td>
                    <td className="py-1 text-right font-mono tabular-nums font-semibold">{fmt(row.netWorth)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
