"use client";

import { useState, useTransition } from "react";
import { saveProjectionConfig } from "@/app/actions/projection";
import type { ProjectionConfig, ScheduleEntry, ExpenseLine } from "@/lib/projection";

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
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
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

export function ProjectionSettings({
  workspaceId,
  initial,
  onSaved,
}: {
  workspaceId: string;
  initial: ProjectionConfig;
  onSaved: (cfg: ProjectionConfig) => void;
}) {
  const [cfg, setCfg] = useState<ProjectionConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(fn: (c: ProjectionConfig) => ProjectionConfig) {
    setCfg((c) => fn(c));
    setSaved(false);
  }

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveProjectionConfig(workspaceId, cfg);
      if (res.error) setError(res.error);
      else {
        setSaved(true);
        onSaved(cfg);
      }
    });
  }

  return (
    <details className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 mb-6" open>
      <summary className="cursor-pointer text-sm font-medium text-zinc-500">⚙️ Projection settings</summary>
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
            Stock
            <NumInput
              value={cfg.growth.stock_annual}
              onChange={(n) => update((c) => ({ ...c, growth: { ...c.growth, stock_annual: n } }))}
              step="0.01"
            />
          </label>
          <label className="flex justify-between items-center gap-2">
            PVD
            <NumInput
              value={cfg.growth.pvd_annual}
              onChange={(n) => update((c) => ({ ...c, growth: { ...c.growth, pvd_annual: n } }))}
              step="0.01"
            />
          </label>
          <label className="flex justify-between items-center gap-2">
            SSF + RMF
            <NumInput
              value={cfg.growth.ssf_rmf_annual}
              onChange={(n) => update((c) => ({ ...c, growth: { ...c.growth, ssf_rmf_annual: n } }))}
              step="0.01"
            />
          </label>
        </div>

        {/* Starting balances */}
        <div className="space-y-2">
          <h3 className="font-medium">Starting balances</h3>
          {(["savings", "stock", "pvd", "ssf_rmf", "marriage"] as const).map((k) => (
            <label key={k} className="flex justify-between items-center gap-2 capitalize">
              {k.replace("_", "+").toUpperCase()}
              <NumInput
                value={cfg.starting[k]}
                onChange={(n) => update((c) => ({ ...c, starting: { ...c.starting, [k]: n } }))}
              />
            </label>
          ))}
        </div>

        {/* Income */}
        <div className="space-y-2">
          <h3 className="font-medium">Income</h3>
          <label className="flex justify-between items-center gap-2">
            Salary (monthly)
            <NumInput
              value={cfg.income.salary_monthly}
              onChange={(n) =>
                update((c) => ({ ...c, income: { ...c.income, salary_monthly: n } }))
              }
            />
          </label>
          <label className="flex justify-between items-center gap-2">
            Annual raise %
            <NumInput
              value={cfg.income.salary_annual_raise_pct}
              onChange={(n) =>
                update((c) => ({ ...c, income: { ...c.income, salary_annual_raise_pct: n } }))
              }
              step="0.01"
            />
          </label>
        </div>

        {/* Deductions */}
        <div className="space-y-2 md:col-span-2">
          <h3 className="font-medium">Deductions</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {(
              [
                ["sso_monthly", "SSO (monthly)"],
                ["provident_pct", "Provident %"],
                ["employer_match_pct", "Employer match %"],
                ["withholding_tax_pct", "Withholding tax %"],
                ["stock_tax_pct", "Stock tax %"],
                ["rmf_esg_monthly", "RMF+ESG (monthly)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex justify-between items-center gap-2">
                {label}
                <NumInput
                  value={cfg.deductions[key]}
                  onChange={(n) =>
                    update((c) => ({ ...c, deductions: { ...c.deductions, [key]: n } }))
                  }
                  step="0.01"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Expenses */}
        <div className="space-y-2 md:col-span-2">
          <h3 className="font-medium">Fixed monthly expenses</h3>
          {cfg.expenses.map((e, i) => (
            <div key={i} className="flex gap-2 items-center text-xs">
              <input
                value={e.label}
                onChange={(ev) => {
                  const next = [...cfg.expenses];
                  next[i] = { ...next[i], label: ev.target.value };
                  update((c) => ({ ...c, expenses: next }));
                }}
                className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
              />
              <NumInput
                value={e.monthly}
                onChange={(n) => {
                  const next = [...cfg.expenses];
                  next[i] = { ...next[i], monthly: n };
                  update((c) => ({ ...c, expenses: next }));
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const next = cfg.expenses.filter((_, j) => j !== i);
                  update((c) => ({ ...c, expenses: next }));
                }}
                className="text-red-500 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const next: ExpenseLine[] = [...cfg.expenses, { label: "New expense", monthly: 0 }];
              update((c) => ({ ...c, expenses: next }));
            }}
            className="text-xs text-green-600 hover:text-green-700"
          >
            + Add expense line
          </button>
        </div>

        {/* Schedules */}
        <div className="space-y-3 md:col-span-2">
          <h3 className="font-medium">One-time schedules</h3>
          <ScheduleEditor
            label="RSU"
            schedule={cfg.income.rsu_schedule}
            onChange={(s) =>
              update((c) => ({ ...c, income: { ...c.income, rsu_schedule: s } }))
            }
          />
          <ScheduleEditor
            label="Bonus stock"
            schedule={cfg.income.bonus_stock_schedule}
            onChange={(s) =>
              update((c) => ({ ...c, income: { ...c.income, bonus_stock_schedule: s } }))
            }
          />
          <ScheduleEditor
            label="Bonus cash"
            schedule={cfg.income.bonus_cash_schedule}
            onChange={(s) =>
              update((c) => ({ ...c, income: { ...c.income, bonus_cash_schedule: s } }))
            }
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-3 pt-2">
          <button
            onClick={onSave}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save projection"}
          </button>
          {error && <span className="text-red-500 text-xs">{error}</span>}
          {saved && <span className="text-green-600 text-xs">Saved ✓</span>}
        </div>
      </div>
    </details>
  );
}
