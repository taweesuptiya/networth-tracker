import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { AssetTable, type Asset } from "@/components/asset-table";
import { AllocationChart } from "@/components/allocation-chart";
import { FxEditor } from "@/components/fx-editor";
import { RefreshButton } from "@/components/refresh-button";
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Net Worth</h1>
          <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/projection"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Projection →
          </Link>
          <Link
            href="/statements"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Statements →
          </Link>
          <RefreshButton workspaceId={active.id} />
          <FxEditor workspaceId={active.id} initial={usdToThb} />
          <span className="text-xs text-zinc-500">{user.email}</span>
          <form action="/auth/signout" method="post">
            <button className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
            <p className="text-sm text-zinc-500">{active.name} — total</p>
            <p className="text-3xl font-semibold mt-1">{formatMoney(total, baseCurrency)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
            <p className="text-sm text-zinc-500">Cost (assets with basis)</p>
            <p className="text-2xl font-semibold mt-1">
              {totalCost > 0 ? formatMoney(totalCost, baseCurrency) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
            <p className="text-sm text-zinc-500">Gain / Loss</p>
            {totalGain != null ? (
              <>
                <p className={`text-2xl font-semibold mt-1 ${totalGain >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {totalGain >= 0 ? "+" : ""}{formatMoney(totalGain, baseCurrency)}
                </p>
                <p className={`text-sm ${totalGain >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {totalGainPct! >= 0 ? "+" : ""}{totalGainPct!.toFixed(2)}%
                </p>
              </>
            ) : (
              <p className="text-2xl font-semibold mt-1 text-zinc-400">—</p>
            )}
          </div>
        </div>

        <AllocationChart data={allocation} baseCurrency={baseCurrency} />

        <AssetTable
          workspaceId={active.id}
          baseCurrency={baseCurrency}
          usdToThb={usdToThb}
          assets={assets}
        />
      </main>
    </div>
  );
}
