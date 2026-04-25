import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { AppShell } from "@/components/app-shell";
import { loadProjectionConfig } from "@/app/actions/projection";
import { ProjectionPageClient } from "@/components/projection-page-client";
import type { SavedBudget } from "@/components/projection-table";
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

  // Aggregate transactions by month for actuals overlay (excludes transfers/cc_payments,
  // nets reimbursements against expenses).
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
  const actuals = monthly.map((m) => ({
    month: m.month,
    income: m.income,
    expense: m.expense,
    expense_by_category: Object.fromEntries(m.expense_by_category),
  }));

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
    <AppShell userEmail={user.email ?? null}>
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
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
          savedBudgets={savedBudgets}
          startingNetworth={startingNetworth}
        />
      </main>
    </AppShell>
  );
}
