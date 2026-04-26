"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  defaultMarriageConfig,
  projectMarriage,
  type MarriageProjectionConfig,
  type ExpenseLine,
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

export function MarriageProjectionClient({
  workspaceId,
  initialConfig,
  actuals,
  savedBudgets,
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
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => projectMarriage(cfg), [cfg]);
  const visible = showAll ? rows : rows.slice(0, 12);

  const actualMap = new Map(actuals.map((a) => [a.month, a]));
  const budgetMap = new Map(savedBudgets.map((b) => [b.month, b]));

  function update<K extends keyof MarriageProjectionConfig>(
    key: K,
    value: MarriageProjectionConfig[K]
  ) {
    setCfg((c) => ({ ...c, [key]: value }));
  }

  function updateStarting<K extends keyof MarriageProjectionConfig["starting"]>(
    k: K,
    v: number
  ) {
    setCfg((c) => ({ ...c, starting: { ...c.starting, [k]: v } }));
  }

  function updateGrowth<K extends keyof MarriageProjectionConfig["growth"]>(
    k: K,
    v: number
  ) {
    setCfg((c) => ({ ...c, growth: { ...c.growth, [k]: v } }));
  }

  function updateLine(
    section: "income_lines" | "expense_lines",
    i: number,
    patch: Partial<ExpenseLine>
  ) {
    setCfg((c) => {
      const lines = [...c[section]];
      lines[i] = { ...lines[i], ...patch };
      return { ...c, [section]: lines };
    });
  }
  function addLine(section: "income_lines" | "expense_lines") {
    setCfg((c) => ({
      ...c,
      [section]: [...c[section], { label: "New line", monthly: 0 }],
    }));
  }
  function removeLine(section: "income_lines" | "expense_lines", i: number) {
    setCfg((c) => ({
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
        router.refresh();
      }
    });
  }

  function onClearBudget() {
    if (!confirm("Clear the saved budget for this workspace?")) return;
    startTransition(async () => {
      const res = await clearBudget(workspaceId);
      if (res.error) setMsg(`Error: ${res.error}`);
      else {
        setMsg("Budget cleared");
        router.refresh();
      }
    });
  }

  return (
    <>
      {/* Settings */}
      <div className="card-surface rounded-2xl p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="display text-lg">Marriage projection settings</h2>
          <div className="flex gap-2 text-xs">
            <button
              onClick={onSave}
              disabled={pending}
              className="px-3 py-1.5 rounded-lg bg-ink text-white disabled:opacity-50"
            >
              {pending ? "..." : "Save settings"}
            </button>
            <button
              onClick={onSaveBudget}
              disabled={pending}
              className="px-3 py-1.5 rounded-lg bg-jade text-white disabled:opacity-50"
            >
              💾 Save as budget
            </button>
            {savedBudgets.length > 0 && (
              <button
                onClick={onClearBudget}
                disabled={pending}
                className="px-3 py-1.5 rounded-lg border text-oxblood"
              >
                Clear budget
              </button>
            )}
          </div>
        </div>
        {msg && <p className="text-xs text-ink-subtle mb-3">{msg}</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          {/* Starting */}
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
              Starting balances
            </h3>
            <NumberField
              label="Savings"
              value={cfg.starting.savings}
              onChange={(v) => updateStarting("savings", v)}
            />
            <NumberField
              label="Condo value"
              value={cfg.starting.condo_value}
              onChange={(v) => updateStarting("condo_value", v)}
            />
            <NumberField
              label="Condo loan"
              value={cfg.starting.condo_loan}
              onChange={(v) => updateStarting("condo_loan", v)}
            />
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
              Annual growth %
            </h3>
            <NumberField
              label="Savings"
              value={cfg.growth.savings_annual * 100}
              suffix="%"
              onChange={(v) => updateGrowth("savings_annual", v / 100)}
            />
            <NumberField
              label="Condo"
              value={cfg.growth.condo_annual * 100}
              suffix="%"
              onChange={(v) => updateGrowth("condo_annual", v / 100)}
            />
          </div>

          <div>
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
              Horizon
            </h3>
            <NumberField
              label="Months"
              value={cfg.months}
              onChange={(v) => update("months", v)}
            />
            <div className="text-xs text-ink-faint mt-2">
              Start: <span className="font-mono">{cfg.start_month}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Income lines */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                Income (monthly)
              </h3>
              <button
                onClick={() => addLine("income_lines")}
                className="text-xs text-jade hover:underline"
              >
                + Add line
              </button>
            </div>
            <div className="space-y-2">
              {cfg.income_lines.map((line, i) => (
                <LineEditor
                  key={i}
                  line={line}
                  onChange={(patch) => updateLine("income_lines", i, patch)}
                  onRemove={() => removeLine("income_lines", i)}
                />
              ))}
            </div>
          </div>

          {/* Expense lines */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                Expenses (monthly)
              </h3>
              <button
                onClick={() => addLine("expense_lines")}
                className="text-xs text-oxblood hover:underline"
              >
                + Add line
              </button>
            </div>
            <div className="space-y-2">
              {cfg.expense_lines.map((line, i) => (
                <LineEditor
                  key={i}
                  line={line}
                  onChange={(patch) => updateLine("expense_lines", i, patch)}
                  onRemove={() => removeLine("expense_lines", i)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Forecast/Budget/Actual table */}
      <div className="card-surface rounded-2xl mb-6 overflow-hidden">
        <div className="flex justify-between items-center px-4 py-3 border-b">
          <h2 className="display text-base">Forecast vs Budget vs Actual</h2>
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-xs text-ink-subtle hover:text-ink"
          >
            {showAll ? "Show first 12" : `Show all ${rows.length}`}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-paper-darker text-left text-ink-faint">
              <tr>
                <th className="px-3 py-2 sticky left-0 bg-paper-darker z-10">Line</th>
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

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-subtle">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 rounded border bg-transparent px-2 py-1 text-right font-mono"
        />
        {suffix && <span className="text-xs text-ink-faint">{suffix}</span>}
      </span>
    </label>
  );
}

function LineEditor({
  line,
  onChange,
  onRemove,
}: {
  line: ExpenseLine;
  onChange: (patch: Partial<ExpenseLine>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={line.label}
        onChange={(e) => onChange({ label: e.target.value })}
        className="flex-1 rounded border bg-transparent px-2 py-1 text-sm"
      />
      <input
        type="number"
        step="any"
        value={line.monthly}
        onChange={(e) => onChange({ monthly: Number(e.target.value) })}
        className="w-28 rounded border bg-transparent px-2 py-1 text-sm font-mono text-right"
      />
      <button
        onClick={onRemove}
        className="text-ink-faint hover:text-oxblood text-sm"
        title="Remove line"
      >
        ✕
      </button>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return (
    <tr className="bg-paper-darker">
      <td
        colSpan={1000}
        className="px-3 py-1.5 text-[10px] uppercase tracking-wide font-medium text-ink-faint sticky left-0"
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
        "border-t " +
        (highlight ? "bg-paper-darker " : "") +
        (muted ? "text-ink-subtle " : "") +
        (bold ? "font-medium " : "")
      }
    >
      <td className="px-3 py-1.5 sticky left-0 bg-card whitespace-nowrap">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-3 py-1.5 text-right whitespace-nowrap font-mono tabular">
          {v === 0 ? "—" : fmt(v)}
        </td>
      ))}
    </tr>
  );
}
