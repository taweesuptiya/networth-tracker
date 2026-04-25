import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { AccountsManager } from "@/components/accounts-manager";
import { RulesManager } from "@/components/rules-manager";
import type { Account } from "@/components/accounts-manager";
import type { Rule } from "@/lib/tx-rules";

export default async function AccountsPage({
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

  const { data: accountRows } = await supabase
    .from("accounts")
    .select("id, name, type, last4, notes")
    .eq("workspace_id", active.id)
    .order("name");
  const accounts: Account[] = accountRows ?? [];

  const { data: ruleRows } = await supabase
    .from("tx_rules")
    .select("*")
    .eq("workspace_id", active.id)
    .order("priority");
  const rules: Rule[] = (ruleRows ?? []) as Rule[];

  return (
    <AppShell userEmail={user.email ?? null}>
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Accounts & rules</h1>
          <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
        </div>
      </header>
      <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto">
        <AccountsManager workspaceId={active.id} accounts={accounts} />
        <RulesManager workspaceId={active.id} rules={rules} />
      </main>
    </AppShell>
  );
}
