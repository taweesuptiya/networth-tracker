import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatementUploader } from "@/components/statement-uploader-dynamic";
import { PdfPasswordsManager } from "@/components/pdf-passwords-manager";
import { AppShell } from "@/components/app-shell";
import type { Rule } from "@/lib/tx-rules";
import { loadProjectionConfig } from "@/app/actions/projection";
import { categoriesByTxType } from "@/lib/projection";

export default async function StatementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id, name")
    .order("name");

  const { data: pdfPasswords } = await supabase
    .from("pdf_passwords")
    .select("id, label, password")
    .order("created_at");

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, type")
    .order("name");

  // Assets across all workspaces (for asset_buy dropdown — typically RMF/Stock are in Personal)
  const { data: assets } = await supabase
    .from("assets")
    .select("id, name, type, workspace_id")
    .order("name");

  const { data: ruleRows } = await supabase
    .from("tx_rules")
    .select("*")
    .order("priority");
  const rules: Rule[] = (ruleRows ?? []) as Rule[];

  // Use the projection config's categories so dropdowns match the budget tracker
  const activeWorkspaceId = (workspaces ?? [])[0]?.id;
  const projectionConfig = activeWorkspaceId
    ? await loadProjectionConfig(activeWorkspaceId)
    : null;
  const categoriesByType = projectionConfig
    ? categoriesByTxType(projectionConfig)
    : {};

  const { data: recentTx } = await supabase
    .from("transactions")
    .select("id, occurred_at, description, amount, currency, direction, category, workspace_id")
    .order("occurred_at", { ascending: false })
    .limit(50);

  return (
    <AppShell userEmail={user.email ?? null}>
      <header className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Upload transactions</h1>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-5xl w-full mx-auto">
        <PdfPasswordsManager initial={pdfPasswords ?? []} />
        <StatementUploader
          workspaces={workspaces ?? []}
          savedPasswords={pdfPasswords ?? []}
          accounts={accounts ?? []}
          rules={rules}
          categoriesByType={categoriesByType}
          assets={(assets ?? []).map((a) => ({
            id: a.id as string,
            name: a.name as string,
            type: a.type as string,
          }))}
        />

        <div className="mt-10">
          <h2 className="text-sm font-medium text-zinc-500 mb-3">Recent transactions</h2>
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(recentTx ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                      No transactions yet. Upload a statement above.
                    </td>
                  </tr>
                ) : (
                  recentTx!.map((t) => (
                    <tr key={t.id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-3">{t.occurred_at}</td>
                      <td className="px-4 py-3">{t.description}</td>
                      <td className="px-4 py-3 text-zinc-500">{t.category ?? "—"}</td>
                      <td
                        className={`px-4 py-3 text-right ${
                          t.direction === "credit" ? "text-green-600" : "text-red-500"
                        }`}
                      >
                        {t.direction === "credit" ? "+" : "−"}
                        {Number(t.amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                        <span className="text-xs text-zinc-500">{t.currency}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
