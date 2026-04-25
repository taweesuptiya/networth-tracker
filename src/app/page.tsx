import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

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
    .select("id, name, base_currency")
    .order("name");

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-500">No workspaces yet.</p>
          <p className="text-xs text-zinc-400 mt-2">
            The signup trigger should have created Personal + Marriage. Re-run schema.sql in Supabase.
          </p>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const activeId = params.ws ?? workspaces[0].id;
  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, type, units, price_per_unit, manual_value, currency")
    .eq("workspace_id", active.id);

  const total = (assets ?? []).reduce((sum, a) => {
    const value = a.manual_value ?? (a.units ?? 0) * (a.price_per_unit ?? 0);
    return sum + Number(value);
  }, 0);

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Net Worth</h1>
          <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{user.email}</span>
          <form action="/auth/signout" method="post">
            <button className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
          <p className="text-sm text-zinc-500">{active.name} — total</p>
          <p className="text-3xl font-semibold mt-1">
            {total.toLocaleString("en-US", { maximumFractionDigits: 0 })}{" "}
            <span className="text-base text-zinc-500">{active.base_currency}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Units</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {(assets ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No assets yet. Phase 2 will add the create form.
                  </td>
                </tr>
              ) : (
                assets!.map((a) => {
                  const value = a.manual_value ?? (a.units ?? 0) * (a.price_per_unit ?? 0);
                  return (
                    <tr key={a.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-3">{a.name}</td>
                      <td className="px-4 py-3 text-zinc-500">{a.type}</td>
                      <td className="px-4 py-3 text-right">{a.units ?? "—"}</td>
                      <td className="px-4 py-3 text-right">{a.price_per_unit ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}{" "}
                        <span className="text-xs text-zinc-500">{a.currency}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
