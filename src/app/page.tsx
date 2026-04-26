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

  // Compute actual net worth trend (running cumulative cash flow from start)
  const actualsByMonth = new Map(actuals.map((a) => [a.month, a]));
  const actualNetworth: { month: string; total: number }[] = [];
  const cfgStart = config.starting as Record<string, number | undefined>;
  const startingNw =
    (cfgStart.savings ?? 0) +
    (cfgStart.stock ?? 0) +
    (cfgStart.pvd ?? 0) +
    (cfgStart.ssf_rmf ?? 0) +
    (cfgStart.marriage ?? 0);
  let runningActual = startingNw;
  for (const r of rows) {
    const a = actualsByMonth.get(r.month);
    if (a) {
      runningActual += a.income - a.expense;
      actualNetworth.push({ month: r.month, total: runningActual });
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
      <header className="px-10 pt-10 pb-6 border-b">
        <div className="flex items-baseline gap-4 mb-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint font-mono">
            {dateString}
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint font-mono">
            № 01 · Dashboard
          </span>
        </div>
        <div className="flex items-end justify-between gap-6">
          <h1 className="display text-5xl leading-[1.05]">
            Net Worth, <span className="text-oxblood">{active.name.toLowerCase()}</span>
          </h1>
          <div className="flex items-center gap-4 pb-1">
            <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
            <RefreshButton workspaceId={active.id} />
            <FxEditor workspaceId={active.id} initial={usdToThb} />
          </div>
        </div>
      </header>

      <main className="flex-1 px-10 py-10 max-w-7xl w-full mx-auto stagger">
        {/* Top stats grid — 4 columns */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-0 rule-bottom pb-8 mb-8">
          <MetricCard
            label="Total net worth"
            value={fmt(total)}
            unit={baseCurrency}
            isPrimary
          />
          <MetricCard
            label={`${monthLabel} · Income`}
            value={thisIncome > 0 ? `+${fmt(thisIncome)}` : "—"}
            unit={baseCurrency}
            tone={thisIncome > 0 ? "jade" : undefined}
          />
          <MetricCard
            label={`${monthLabel} · Expenses`}
            value={thisExpense > 0 ? `−${fmt(thisExpense)}` : "—"}
            unit={baseCurrency}
            tone={thisExpense > 0 ? "oxblood" : undefined}
          />
          <MetricCard
            label={`${monthLabel} · Net flow`}
            value={
              thisNet === 0
                ? "—"
                : `${thisNet >= 0 ? "+" : "−"}${fmt(Math.abs(thisNet))}`
            }
            unit={baseCurrency}
            tone={thisNet >= 0 ? "jade" : "oxblood"}
          />
        </section>

        {/* Net worth chart + Allocation pie row */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <DashboardCharts
              rows={rows}
              actuals={actuals}
              savedBudgets={savedBudgets}
              actualNetworth={actualNetworth}
            />
          </div>
          <div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 mb-6">
              <h2 className="display italic text-base mb-3">Allocation</h2>
              <AllocationChart data={allocation} baseCurrency={baseCurrency} />
            </div>
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
                Cost basis
              </h2>
              <p className="metric text-3xl text-ink-subtle">
                {totalCost > 0 ? fmt(totalCost) : "—"}
              </p>
              {totalCost > 0 && (
                <p className="text-xs text-ink-faint mt-1 font-mono">{baseCurrency}</p>
              )}
              {totalGain != null && (
                <>
                  <h2 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mt-4 mb-2">
                    Unrealized gain
                  </h2>
                  <p
                    className={`metric text-3xl ${
                      totalGain >= 0 ? "text-jade-bright" : "text-oxblood-bright"
                    }`}
                  >
                    {totalGain >= 0 ? "+" : "−"}
                    {fmt(Math.abs(totalGain))}
                  </p>
                  <p
                    className={`text-sm font-mono mt-1 ${
                      totalGain >= 0 ? "text-jade-bright" : "text-oxblood-bright"
                    }`}
                  >
                    {totalGainPct! >= 0 ? "+" : ""}
                    {totalGainPct!.toFixed(2)}%
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-4">
            Holdings
          </h2>
          <AssetTable
            workspaceId={active.id}
            baseCurrency={baseCurrency}
            usdToThb={usdToThb}
            assets={assets}
          />
        </section>
      </main>
    </AppShell>
  );
}

function fmt(n: number) {
  return Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function MetricCard({
  label,
  value,
  unit,
  tone,
  isPrimary,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "jade" | "oxblood";
  isPrimary?: boolean;
}) {
  const toneCls =
    tone === "jade"
      ? "text-jade-bright"
      : tone === "oxblood"
        ? "text-oxblood-bright"
        : "";
  return (
    <div className="px-6 py-4 border-r last:border-r-0">
      <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-2">
        {label}
      </p>
      <p className={"metric " + (isPrimary ? "text-5xl" : "text-3xl") + " " + toneCls}>
        {value}
      </p>
      <p className="text-xs text-ink-faint mt-2 font-mono">{unit}</p>
    </div>
  );
}
