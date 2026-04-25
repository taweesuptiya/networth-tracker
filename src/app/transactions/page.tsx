import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { TransactionsBrowser, type Tx, type AccountRef } from "@/components/transactions-browser";

export default async function TransactionsPage({
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
    .select("id, name")
    .order("name");
  if (!workspaces || workspaces.length === 0) redirect("/");

  const params = await searchParams;
  const activeId = params.ws ?? workspaces[0].id;
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  const { data: txData } = await supabase
    .from("transactions")
    .select("id, occurred_at, description, amount, currency, direction, tx_type, category, account_id")
    .eq("workspace_id", active.id)
    .order("occurred_at", { ascending: false })
    .limit(5000);
  const txs: Tx[] = (txData ?? []).map((t) => ({
    ...t,
    occurred_at: String(t.occurred_at),
    amount: Number(t.amount),
  })) as Tx[];

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, name, type")
    .eq("workspace_id", active.id);
  const accounts: AccountRef[] = accountRows ?? [];

  return (
    <AppShell userEmail={user.email ?? null}>
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Transactions</h1>
          <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
        </div>
        <span className="text-xs text-zinc-500">
          {txs.length} total
        </span>
      </header>
      <main className="flex-1 px-6 py-8 max-w-6xl w-full mx-auto">
        <TransactionsBrowser txs={txs} accounts={accounts} />
      </main>
    </AppShell>
  );
}
