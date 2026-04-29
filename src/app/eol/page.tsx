import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { AppShell } from "@/components/app-shell";
import { loadEolConfig } from "@/app/actions/eol";
import { EolClient } from "@/components/eol-client";

export default async function EolPage({
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
    .select("id, name, base_currency")
    .order("name");
  if (!workspaces || workspaces.length === 0) redirect("/");

  const params = await searchParams;
  const activeId = params.ws ?? workspaces[0].id;
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  const config = await loadEolConfig(active.id);

  return (
    <AppShell userEmail={user.email ?? null}>
      <header className="flex items-center justify-between border-b px-4 md:px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="display text-lg">EOL Projection</h1>
          <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
        </div>
        <div className="text-xs text-zinc-500">Age {new Date().getFullYear() - config.birthYear}</div>
      </header>
      <main className="flex-1 overflow-auto px-4 md:px-6 py-6">
        <EolClient
          workspaceId={active.id}
          initialConfig={config}
          currency={active.base_currency}
        />
      </main>
    </AppShell>
  );
}
