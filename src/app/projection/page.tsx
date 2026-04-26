import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { AppShell } from "@/components/app-shell";
import { loadProjectionConfig } from "@/app/actions/projection";
import { ProjectionPageClient } from "@/components/projection-page-client";
import { MarriageProjectionClient } from "@/components/marriage-projection-client";
import type { SavedBudget } from "@/components/projection-table";
import type { SavedBudgetMarriage } from "@/components/marriage-projection-client";
import { isMarriageConfig, type ProjectionConfig } from "@/lib/projection";
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
    .select("occurred_at, amount, direction, tx_type, category")
    .eq("workspace_id", active.id);

  const { aggregateMonthly } = await import("@/lib/tx-rules");
  const monthly = aggregateMonthly(
    (txs ?? []).map((t) => ({
      occurred_at: String(t.occurred_at),
      amount: Number(t.amount),
      direction: t.direction as "credit" | "debit",
      tx_type: String(t.tx_type),
      category: t.category as string | null,
    }))
  );

  const { data: budgetRows } = await supabase
    .from("monthly_budgets")
    .select("month, income_budget, expense_budget, net_save_budget, total_networth_budget, expense_lines")
    .eq("workspace_id", active.id)
    .order("month");

  const { data: assetsData } = await supabase
    .from("assets")
    .select("units, price_per_unit, manual_value, currency")
    .eq("workspace_id", active.id);
  const usdToThb = Number(active.usd_to_thb ?? 32.33);
  const startingNetworth = (assetsData ?? []).reduce(
    (s, a) => s + valueInBase(a, active.base_currency, usdToThb),
    0
  );

  const headerStarting = (
    <div className="text-xs text-zinc-500">
      Starting net worth:{" "}
      {Math.round(startingNetworth).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      })}{" "}
      {active.base_currency}
    </div>
  );

  // Marriage flow — separate, lighter projection page
  if (isMarriageConfig(config)) {
    const actuals = monthly.map((m) => ({
      month: m.month,
      income: m.income,
      expense: m.expense,
      expense_by_category: Object.fromEntries(m.expense_by_category),
    }));
    const savedBudgets: SavedBudgetMarriage[] = (budgetRows ?? []).map((b) => ({
      month: String(b.month).slice(0, 7),
      income_budget: Number(b.income_budget),
      expense_budget: Number(b.expense_budget),
      net_save_budget: Number(b.net_save_budget),
      total_networth_budget: Number(b.total_networth_budget),
    }));

    return (
      <AppShell userEmail={user.email ?? null}>
        <header className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="display text-lg">Marriage projection</h1>
            <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
          </div>
          {headerStarting}
        </header>
        <main className="flex-1 px-6 py-8 max-w-7xl w-full mx-auto">
          <MarriageProjectionClient
            workspaceId={active.id}
            initialConfig={config}
            actuals={actuals}
            savedBudgets={savedBudgets}
          />
        </main>
      </AppShell>
    );
  }

  // Personal flow — existing rich projection
  const { data: massRows } = await supabase
    .from("monthly_asset_snapshots")
    .select("month, value, asset_id")
    .eq("workspace_id", active.id);
  const { data: assetMeta } = await supabase
    .from("assets")
    .select("id, name, type")
    .eq("workspace_id", active.id);
  const assetNameById = new Map((assetMeta ?? []).map((a) => [a.id as string, a.name as string]));
  const assetMonthValues = new Map<string, Map<string, number>>();
  for (const r of massRows ?? []) {
    const name = assetNameById.get(r.asset_id as string) ?? "Unknown";
    const m = String(r.month).slice(0, 7);
    let inner = assetMonthValues.get(name);
    if (!inner) {
      inner = new Map();
      assetMonthValues.set(name, inner);
    }
    inner.set(m, (inner.get(m) ?? 0) + Number(r.value));
  }

  const savedBudgets: SavedBudget[] = (budgetRows ?? []).map((b) => ({
    month: String(b.month).slice(0, 7),
    income_budget: Number(b.income_budget),
    expense_budget: Number(b.expense_budget),
    net_save_budget: Number(b.net_save_budget),
    total_networth_budget: Number(b.total_networth_budget),
    expense_lines: (b.expense_lines ?? []) as { label: string; amount: number }[],
  }));

  const actuals = monthly.map((m) => ({
    month: m.month,
    income: m.income,
    expense: m.expense,
    expense_by_category: Object.fromEntries(m.expense_by_category),
    gross_expense_by_category: Object.fromEntries(m.gross_expense_by_category),
    reimbursement_by_category: Object.fromEntries(m.reimbursement_by_category),
  }));

  return (
    <AppShell userEmail={user.email ?? null}>
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="display text-lg">Net worth projection</h1>
          <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
        </div>
        {headerStarting}
      </header>

      <main className="flex-1 px-6 py-8 max-w-7xl w-full mx-auto">
        <ProjectionPageClient
          workspaceId={active.id}
          initialConfig={config as ProjectionConfig}
          actuals={actuals}
          savedBudgets={savedBudgets}
          startingNetworth={startingNetworth}
          assetMonthValues={Object.fromEntries(
            Array.from(assetMonthValues.entries()).map(([name, inner]) => [
              name,
              {
                type: Array.from(assetMeta ?? [])
                  .find((a) => a.name === name)?.type ?? "Other",
                values: Object.fromEntries(inner),
              },
            ])
          )}
        />
      </main>
    </AppShell>
  );
}
