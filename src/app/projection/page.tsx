import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { loadProjectionConfig } from "@/app/actions/projection";
import { ProjectionPageClient } from "@/components/projection-page-client";
import { valueInBase } from "@/lib/money";

export default async function ProjectionPage({
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
  if (!workspaces || workspaces.length === 0) redirect("/");

  const params = await searchParams;
  const activeId = params.ws ?? workspaces[0].id;
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  const config = await loadProjectionConfig(active.id);

  // Aggregate transactions by month for actuals overlay
  const { data: txs } = await supabase
    .from("transactions")
    .select("occurred_at, amount, currency, direction")
    .eq("workspace_id", active.id);

  const actualsMap = new Map<string, { income: number; expense: number }>();
  for (const t of txs ?? []) {
    const month = String(t.occurred_at).slice(0, 7); // YYYY-MM
    const cur = actualsMap.get(month) ?? { income: 0, expense: 0 };
    const amt = Number(t.amount);
    if (t.direction === "credit") cur.income += amt;
    else cur.expense += amt;
    actualsMap.set(month, cur);
  }
  const actuals = Array.from(actualsMap.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Starting net worth = current asset total in base currency
  const { data: assetsData } = await supabase
    .from("assets")
    .select("units, price_per_unit, manual_value, currency")
    .eq("workspace_id", active.id);
  const usdToThb = Number(active.usd_to_thb ?? 32.33);
  const startingNetworth = (assetsData ?? []).reduce(
    (s, a) => s + valueInBase(a, active.base_currency, usdToThb),
    0
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-sm"
          >
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold">Net worth projection</h1>
          <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
        </div>
        <div className="text-xs text-zinc-500">
          Starting net worth:{" "}
          {Math.round(startingNetworth).toLocaleString("en-US", {
            maximumFractionDigits: 0,
          })}{" "}
          {active.base_currency}
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-7xl w-full mx-auto">
        <ProjectionPageClient
          workspaceId={active.id}
          initialConfig={config}
          actuals={actuals}
          startingNetworth={startingNetworth}
        />
      </main>
    </div>
  );
}
