import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { AssetTable, type Asset } from "@/components/asset-table";
import { AllocationChart } from "@/components/allocation-chart";
import { FxEditor } from "@/components/fx-editor";
import { RefreshButton } from "@/components/refresh-button";
import { AppShell } from "@/components/app-shell";
import { valueInBase, convertCurrency, formatMoney } from "@/lib/money";

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
  let costAssetsValue = 0; // value of only assets that have a cost_basis (for fair gain%)
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

  const dateString = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
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

      <main className="flex-1 px-10 py-10 max-w-6xl w-full mx-auto stagger">
        <section className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-6 mb-12 rule-bottom pb-10">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
              {active.name} · Total
            </p>
            <p className="metric text-6xl">
              {Math.round(total).toLocaleString("en-US")}
            </p>
            <p className="text-xs text-ink-subtle mt-2 font-mono">{baseCurrency}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
              Cost basis
            </p>
            <p className="metric text-4xl text-ink-subtle">
              {totalCost > 0 ? Math.round(totalCost).toLocaleString("en-US") : "—"}
            </p>
            {totalCost > 0 && (
              <p className="text-xs text-ink-faint mt-2 font-mono">{baseCurrency}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
              Gain / Loss
            </p>
            {totalGain != null ? (
              <>
                <p
                  className={`metric text-4xl ${
                    totalGain >= 0 ? "text-jade-bright" : "text-oxblood-bright"
                  }`}
                >
                  {totalGain >= 0 ? "+" : "−"}
                  {Math.round(Math.abs(totalGain)).toLocaleString("en-US")}
                </p>
                <p
                  className={`text-sm font-mono mt-2 ${
                    totalGain >= 0 ? "text-jade-bright" : "text-oxblood-bright"
                  }`}
                >
                  {totalGainPct! >= 0 ? "+" : ""}
                  {totalGainPct!.toFixed(2)}%
                </p>
              </>
            ) : (
              <p className="metric text-4xl text-ink-faint">—</p>
            )}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-4">
            Allocation
          </h2>
          <AllocationChart data={allocation} baseCurrency={baseCurrency} />
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
