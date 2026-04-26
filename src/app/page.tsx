import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { AssetTable, type Asset } from "@/components/asset-table";
import { AllocationChart } from "@/components/allocation-chart";
import { FxEditor } from "@/components/fx-editor";
import { RefreshButton } from "@/components/refresh-button";
import { AppShell } from "@/components/app-shell";
import { DashboardCharts } from "@/components/dashboard-charts";
import type { SavedBudget } from "@/components/projection-table";
import { valueInBase, convertCurrency, formatMoney } from "@/lib/money";
import { loadProjectionConfig } from "@/app/actions/projection";
import { project } from "@/lib/projection";
import { aggregateMonthly } from "@/lib/tx-rules";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name, base_currency, usd_to_thb")
    .order("name");

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500">No workspaces yet.</p>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const activeId = params.ws ?? workspaces[0].id;
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];
  const baseCurrency = active.base_currency;
  const usdToThb = Number(active.usd_to_thb ?? 32.33);

  const { data: assetsData } = await supabase
    .from("assets")
    .select("id, name, type, symbol, price_source, units, price_per_unit, manual_value, cost_basis, currency, notes")
    .eq("workspace_id", active.id)
    .order("type")
    .order("name");

  const assets: Asset[] = assetsData ?? [];

  const totalsByType = new Map<string, number>();
  let total = 0;
  let totalCost = 0;
  let costAssetsValue = 0;
  for (const a of assets) {
    const v = valueInBase(a, baseCurrency, usdToThb);
    total += v;
    totalsByType.set(a.type, (totalsByType.get(a.type) ?? 0) + v);
    if (a.cost_basis != null) {
      totalCost += convertCurrency(Number(a.cost_basis), a.currency, baseCurrency, usdToThb);
      costAssetsValue += v;
    }
  }
  const allocation = Array.from(totalsByType.entries()).map(([type, value]) => ({
    type,
    value,
  }));
  const totalGain = totalCost > 0 ? costAssetsValue - totalCost : null;
  const totalGainPct = totalCost > 0 ? (totalGain! / totalCost) * 100 : null;

  // Charts data: projection rows + actuals + saved budgets
  const config = await loadProjectionConfig(active.id);
  const rows = project(config);

  const { data: txs } = await supabase
    .from("transactions")
    .select("occurred_at, amount, direction, tx_type, category")
    .eq("workspace_id", active.id);
  const monthly = aggregateMonthly(
    (txs ?? []).map((t) => ({
      occurred_at: String(t.occurred_at),
      amount: Number(t.amount),
      direction: t.direction as "credit" | "debit",
      tx_type: String(t.tx_type),
      category: t.category as string | null,
    }))
  );
  const actuals = monthly.map((m) => ({
    month: m.month,
    income: m.income,
    expense: m.expense,
    expense_by_category: Object.fromEntries(m.expense_by_category),
  }));

  const { data: budgetRows } = await supabase
    .from("monthly_budgets")
    .select("month, income_budget, expense_budget, net_save_budget, total_networth_budget, expense_lines")
    .eq("workspace_id", active.id)
    .order("month");
  const savedBudgets: SavedBudget[] = (budgetRows ?? []).map((b) => ({
    month: String(b.month).slice(0, 7),
    income_budget: Number(b.income_budget),
    expense_budget: Number(b.expense_budget),
    net_save_budget: Number(b.net_save_budget),
    total_networth_budget: Number(b.total_networth_budget),
    expense_lines: (b.expense_lines ?? []) as { label: string; amount: number }[],
  }));

  // Compute actual net worth per month from per-asset snapshots (precise) when available;
  // anchor today on currentTotal; for months without snapshots, walk back from today by
  // subtracting subsequent cash flow as a fallback estimate.
  const { data: massRows } = await supabase
    .from("monthly_asset_snapshots")
    .select("month, value")
    .eq("workspace_id", active.id);
  const investmentByMonth = new Map<string, number>();
  for (const r of massRows ?? []) {
    const m = String(r.month).slice(0, 7);
    investmentByMonth.set(m, (investmentByMonth.get(m) ?? 0) + Number(r.value));
  }

  const actualsByMonth = new Map(actuals.map((a) => [a.month, a]));
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const actualNetworth: { month: string; total: number }[] = [];

  // Walk months from oldest to newest among rows that have either a snapshot or actual cash flow
  const monthsWithData = new Set<string>();
  for (const m of investmentByMonth.keys()) monthsWithData.add(m);
  for (const a of actuals) monthsWithData.add(a.month);
  const sortedDataMonths = Array.from(monthsWithData).sort();

  // For months that have monthly_asset_snapshots → use the snapshot total directly (it IS the NW for that month)
  // For months without, fall back to walking from currentTotal backwards.
  const todayNw = total;
  // Build a quick map from snapshot months
  const snapshotForMonth = (m: string) => investmentByMonth.get(m);

  // First pass — record snapshot months precisely; use forecast row order for chart x-axis
  for (const r of rows) {
    const m = r.month;
    const snap = snapshotForMonth(m);
    const a = actualsByMonth.get(m);
    if (m === currentMonthKey && todayNw > 0) {
      actualNetworth.push({ month: m, total: todayNw });
    } else if (snap != null && snap > 0) {
      actualNetworth.push({ month: m, total: snap });
    } else if (a) {
      // No snapshot and not current: estimate from todayNw backwards by subtracting future cash flow
      // (only works if we already have cumulative actuals — for forward months past today we skip)
      if (m > currentMonthKey) continue;
      let est = todayNw;
      for (const f of sortedDataMonths) {
        if (f > m) {
          const af = actualsByMonth.get(f);
          if (af) est -= af.income - af.expense;
        }
      }
      actualNetworth.push({ month: m, total: est });
    }
  }

  // Current month metrics
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonth = actuals.find((a) => a.month === currentMonth);
  const thisIncome = thisMonth?.income ?? 0;
  const thisExpense = thisMonth?.expense ?? 0;
  const thisNet = thisIncome - thisExpense;

  const dateString = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const monthLabel = new Date().toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <AppShell userEmail={user.email ?? null}>
      <header className="px-4 pt-6 pb-4 md:px-10 md:pt-10 md:pb-6 border-b">
        <div className="flex items-baseline gap-4 mb-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint font-mono">
            {dateString}
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint font-mono">
            № 01 · Dashboard
          </span>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
          <h1 className="display text-4xl md:text-5xl leading-[1.05]">
            Net Worth, <span className="text-oxblood">{active.name.toLowerCase()}</span>
          </h1>
          <div className="flex items-center gap-3 md:gap-4 md:pb-1">
            <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
            <RefreshButton workspaceId={active.id} />
            <FxEditor workspaceId={active.id} initial={usdToThb} />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 md:px-10 md:py-8 max-w-7xl w-full mx-auto stagger">
        {/* TOP ROW: Hero NW card + 3 monthly metric cards */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
          <div className="lg:col-span-5 card-hero rounded-2xl p-6 flex flex-col justify-between min-h-[180px]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint">
                Total net worth · {active.name}
              </p>
              <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-ink-faint">
                {dateString.split(" ").slice(0, 2).join(" ")}
              </span>
            </div>
            <div className="mt-2">
              <p className="metric text-6xl">{fmt(total)}</p>
              <p className="text-xs text-ink-subtle mt-2 font-mono">{baseCurrency}</p>
            </div>
            <div className="flex items-end justify-between gap-3 mt-2 pt-3 border-t border-ink/10">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-faint">
                  Cost basis
                </p>
                <p className="font-mono text-base mt-0.5">
                  {totalCost > 0 ? fmt(totalCost) : "—"}
                </p>
              </div>
              {totalGain != null && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-ink-faint">
                    Unrealized
                  </p>
                  <p
                    className={`font-mono text-base mt-0.5 ${
                      totalGain >= 0 ? "text-jade-bright" : "text-oxblood-bright"
                    }`}
                  >
                    {totalGain >= 0 ? "+" : "−"}
                    {fmt(Math.abs(totalGain))}{" "}
                    <span className="text-xs">
                      ({totalGainPct! >= 0 ? "+" : ""}
                      {totalGainPct!.toFixed(1)}%)
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-5">
            <PillCard
              label={`${monthLabel}`}
              sub="Income"
              value={thisIncome > 0 ? `+${fmt(thisIncome)}` : "—"}
              unit={baseCurrency}
              tone={thisIncome > 0 ? "jade" : undefined}
            />
            <PillCard
              label={`${monthLabel}`}
              sub="Expenses"
              value={thisExpense > 0 ? `−${fmt(thisExpense)}` : "—"}
              unit={baseCurrency}
              tone={thisExpense > 0 ? "oxblood" : undefined}
            />
            <PillCard
              label={`${monthLabel}`}
              sub="Net flow"
              value={
                thisNet === 0
                  ? "—"
                  : `${thisNet >= 0 ? "+" : "−"}${fmt(Math.abs(thisNet))}`
              }
              unit={baseCurrency}
              tone={thisNet >= 0 ? "jade" : "oxblood"}
            />
          </div>
        </section>

        {/* MIDDLE ROW: Charts (2/3) + Allocation (1/3) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
          <div className="lg:col-span-2">
            <DashboardCharts
              rows={rows}
              actuals={actuals}
              savedBudgets={savedBudgets}
              actualNetworth={actualNetworth}
            />
          </div>
          <div className="card-surface rounded-2xl p-5">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="display italic text-lg leading-none">Allocation</h2>
              <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                by type
              </span>
            </div>
            <AllocationChart data={allocation} baseCurrency={baseCurrency} />
          </div>
        </section>

        {/* HOLDINGS */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="display italic text-xl leading-none">Holdings</h2>
            <span className="text-[10px] uppercase tracking-[0.2em] text-ink-faint">
              {assets.length} assets
            </span>
          </div>
          <div className="card-surface rounded-2xl overflow-hidden">
            <AssetTable
              workspaceId={active.id}
              baseCurrency={baseCurrency}
              usdToThb={usdToThb}
              assets={assets}
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function fmt(n: number) {
  return Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function PillCard({
  label,
  sub,
  value,
  unit,
  tone,
}: {
  label: string;
  sub: string;
  value: string;
  unit: string;
  tone?: "jade" | "oxblood";
}) {
  const toneCls =
    tone === "jade"
      ? "text-jade-bright"
      : tone === "oxblood"
        ? "text-oxblood-bright"
        : "";
  return (
    <div className="card-surface rounded-2xl p-5 flex flex-col justify-between min-h-[180px]">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint">
          {label}
        </p>
        <p className="text-[11px] text-ink-subtle mt-1 italic">{sub}</p>
      </div>
      <div className="mt-3">
        <p className={"metric text-3xl " + toneCls}>{value}</p>
        <p className="text-xs text-ink-faint mt-2 font-mono">{unit}</p>
      </div>
    </div>
  );
}
