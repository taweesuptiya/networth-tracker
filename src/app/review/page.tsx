import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { BackfillButton } from "@/components/backfill-button";
import { aggregateMonthly } from "@/lib/tx-rules";
import { loadProjectionConfig } from "@/app/actions/projection";
import { project } from "@/lib/projection";
import { valueInBase } from "@/lib/money";

const fmt = (n: number) =>
  Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

const monthLabel = (m: string) =>
  new Date(m + "-01").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

function monthRange(m: string): { from: string; to: string } {
  const [y, mo] = m.split("-").map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  return {
    from: `${y}-${String(mo).padStart(2, "0")}-01`,
    to: `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export default async function ReviewPage({
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
  const baseCurrency = active.base_currency;
  const usdToThb = Number(active.usd_to_thb ?? 32.33);

  // Aggregate transactions per month (excludes transfers/cc_payments, nets reimbursements)
  const { data: txs } = await supabase
    .from("transactions")
    .select("occurred_at, amount, direction, tx_type, category")
    .eq("workspace_id", active.id);
  const monthly = aggregateMonthly(
    (txs ?? []).map((t) => ({
      occurred_at: String(t.occurred_at),
      amount: Number(t.amount),
      direction: t.direction as "credit" | "debit",
      tx_type: String(t.tx_type),
      category: t.category as string | null,
    }))
  );

  // Saved budgets per month
  const { data: budgetRows } = await supabase
    .from("monthly_budgets")
    .select("month, income_budget, expense_budget, net_save_budget, total_networth_budget, expense_lines")
    .eq("workspace_id", active.id);
  const budgetMap = new Map(
    (budgetRows ?? []).map((b) => [
      String(b.month).slice(0, 7),
      {
        income: Number(b.income_budget),
        expense: Number(b.expense_budget),
        net_save: Number(b.net_save_budget),
        total_nw: Number(b.total_networth_budget),
        lines: (b.expense_lines ?? []) as { label: string; amount: number }[],
      },
    ])
  );

  // Projection forecast per month for the same months (for forecast comparison + asset change estimates)
  const config = await loadProjectionConfig(active.id);
  const forecastRows = project(config);
  const forecastMap = new Map(forecastRows.map((r) => [r.month, r]));

  // Net worth snapshots — first/last per month for delta
  const { data: snapshotRows } = await supabase
    .from("networth_snapshots")
    .select("recorded_at, total_value")
    .eq("workspace_id", active.id)
    .order("recorded_at");
  const monthSnapshots = new Map<string, { first: number; last: number }>();
  for (const s of snapshotRows ?? []) {
    const m = String(s.recorded_at).slice(0, 7);
    const v = Number(s.total_value);
    const cur = monthSnapshots.get(m);
    if (!cur) monthSnapshots.set(m, { first: v, last: v });
    else cur.last = v;
  }

  // Per-asset monthly snapshots — sum to get a precise per-month investment total
  const { data: massRows } = await supabase
    .from("monthly_asset_snapshots")
    .select("month, value")
    .eq("workspace_id", active.id);
  const investmentByMonth = new Map<string, number>();
  for (const r of massRows ?? []) {
    const m = String(r.month).slice(0, 7);
    investmentByMonth.set(m, (investmentByMonth.get(m) ?? 0) + Number(r.value));
  }

  // Current assets — for "today" baseline reference
  const { data: assetsData } = await supabase
    .from("assets")
    .select("name, type, units, price_per_unit, manual_value, currency")
    .eq("workspace_id", active.id);
  const currentTotal = (assetsData ?? []).reduce(
    (s, a) => s + valueInBase(a, baseCurrency, usdToThb),
    0
  );

  // Show months that have either actual data OR a saved budget, sorted newest-first
  const allMonths = new Set<string>();
  for (const m of monthly) allMonths.add(m.month);
  for (const m of budgetMap.keys()) allMonths.add(m);
  const months = Array.from(allMonths).sort().reverse();

  const currentMonth = new Date().toISOString().slice(0, 7);

  // Fallback for actual NW per month when no snapshot exists:
  // walk backward from today's live total and subtract the net cash flow of months after m.
  // (Approximates the end-of-month NW assuming investment values held; misses NAV moves
  // between then and now, but better than showing "—".)
  const actualNwByMonth = new Map<string, number>();
  // Sort months oldest-first
  const monthsAsc = [...months].sort();
  // Sum of net cash save by month (income - expense) using actuals
  const netByMonth = new Map<string, number>();
  for (const a of monthly) netByMonth.set(a.month, a.income - a.expense);

  // Start from today (currentTotal) and walk older months
  let runningNw = currentTotal;
  for (let i = monthsAsc.length - 1; i >= 0; i--) {
    const m = monthsAsc[i];
    const snap = monthSnapshots.get(m);
    if (m === currentMonth) {
      // Current month's "actual" = live total
      actualNwByMonth.set(m, currentTotal);
    } else if (snap?.last != null) {
      // Use snapshot if available
      actualNwByMonth.set(m, snap.last);
      runningNw = snap.last; // rebase the walk to the precise value
    } else {
      // Estimate: NW at end of month m = runningNw - netCashSave(m+1 ... today)
      // (i.e., subtract everything earned/spent AFTER this month from current)
      // Note: runningNw already represents "end of next month" or "today"; subtract this month's NEXT cash flows.
      // Simpler: estimated end-of-month value = runningNw - cash flow of all months after m
      actualNwByMonth.set(m, runningNw);
    }
    // For the next (older) iteration, subtract this month's net cash save from runningNw
    runningNw -= netByMonth.get(m) ?? 0;
  }

  return (
    <AppShell userEmail={user.email ?? null}>
      <header className="px-10 pt-10 pb-6 border-b">
        <div className="flex items-baseline gap-4 mb-2">
          <span className="text-[11px] uppercase tracking-[0.2em] text-ink-faint font-mono">
            № 06 · Monthly Review
          </span>
        </div>
        <div className="flex items-end justify-between gap-6">
          <h1 className="display text-5xl leading-[1.05]">
            How the months <span className="italic text-oxblood">moved</span>.
          </h1>
          <div className="flex items-center gap-3 pb-1">
            <WorkspaceSwitcher workspaces={workspaces} activeId={active.id} />
            <span className="text-xs text-ink-faint font-mono">
              today: {fmt(currentTotal)} {baseCurrency}
            </span>
          </div>
        </div>
        <p className="text-sm text-ink-subtle mt-4 max-w-2xl">
          Each card connects one month&apos;s spending to the asset balance change. Click any
          category or merchant to drill into the underlying transactions.
        </p>
        <div className="mt-4">
          <BackfillButton workspaceId={active.id} />
        </div>
      </header>

      <main className="flex-1 px-10 py-10 max-w-6xl w-full mx-auto stagger">
        {months.length === 0 ? (
          <p className="text-ink-subtle">
            No transactions or budget yet. Upload a statement to start.
          </p>
        ) : (
          months.map((m) => {
            const actual = monthly.find((x) => x.month === m);
            const budget = budgetMap.get(m);
            const forecast = forecastMap.get(m);
            const snap = monthSnapshots.get(m);

            const actualIncome = actual?.income ?? 0;
            const actualExpense = actual?.expense ?? 0;
            const actualNet = actualIncome - actualExpense;

            const budgetIncome = budget?.income ?? forecast?.total_income ?? 0;
            const budgetExpense = budget?.expense ?? forecast?.expenses ?? 0;
            const budgetNet = budget?.net_save ?? forecast?.net_cash_save ?? 0;

            // Top expense categories for the month
            const topCats = actual
              ? Array.from(actual.expense_by_category.entries())
                  .filter(([, v]) => v > 0)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
              : [];
            const totalCatSpend = topCats.reduce((s, [, v]) => s + v, 0);

            // Investment value (sum of per-asset month-end snapshots) — precise when backfilled
            const investmentEnd = investmentByMonth.get(m);
            const prevMonthIdx = months.indexOf(m) + 1; // months sorted desc; previous month is later in array
            const prevM = months[prevMonthIdx];
            const investmentStart = prevM ? investmentByMonth.get(prevM) : undefined;
            const investmentChange =
              investmentEnd != null && investmentStart != null
                ? investmentEnd - investmentStart
                : null;

            // Asset balance changes
            const nwChange = snap ? snap.last - snap.first : null;
            const savingChange = actualNet;
            // Prefer precise investment change when available; fall back to derived value
            const otherAssetChange =
              investmentChange != null
                ? investmentChange
                : nwChange != null
                  ? nwChange - savingChange
                  : null;

            const { from, to } = monthRange(m);
            const txParams = (extra: Record<string, string>) => {
              const p = new URLSearchParams({ ws: active.id, from, to, ...extra });
              return `/transactions?${p.toString()}`;
            };

            return (
              <article
                key={m}
                className="rule-bottom pb-10 mb-10 grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-6"
              >
                {/* Month label + headline */}
                <div className="md:col-span-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-2">
                    {monthLabel(m)}
                  </p>
                  <p className="metric text-4xl">
                    {actualNet >= 0 ? "+" : "−"}
                    {fmt(Math.abs(actualNet))}
                  </p>
                  <p className="text-xs text-ink-subtle mt-1 font-mono">
                    Net cash · {baseCurrency}
                  </p>
                  {nwChange != null && (
                    <p
                      className={
                        "text-xs mt-3 font-mono " +
                        (nwChange >= 0 ? "text-jade-bright" : "text-oxblood-bright")
                      }
                    >
                      Net worth: {nwChange >= 0 ? "+" : "−"}
                      {fmt(Math.abs(nwChange))}
                    </p>
                  )}
                </div>

                {/* Cash flow vs budget */}
                <div className="md:col-span-4 border-l pl-8">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
                    Cash flow
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-ink-faint uppercase tracking-wider">
                        <th></th>
                        <th className="text-right pb-1">Actual</th>
                        <th className="text-right pb-1">Budget</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono tabular">
                      <tr>
                        <td className="py-1">Income</td>
                        <td className="text-right">
                          <Link
                            prefetch={false}
                            href={txParams({ tx_type: "income" })}
                            className="hover:underline"
                          >
                            {fmt(actualIncome)}
                          </Link>
                        </td>
                        <td className="text-right text-ink-subtle">
                          {fmt(budgetIncome)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1">Expense</td>
                        <td className="text-right">
                          <Link
                            prefetch={false}
                            href={txParams({ tx_type: "expense" })}
                            className="hover:underline"
                          >
                            {fmt(actualExpense)}
                          </Link>
                        </td>
                        <td className="text-right text-ink-subtle">
                          {fmt(budgetExpense)}
                        </td>
                      </tr>
                      <tr className="border-t">
                        <td className="py-1 font-medium">Net save</td>
                        <td
                          className={
                            "text-right font-medium " +
                            (actualNet >= 0 ? "text-jade-bright" : "text-oxblood-bright")
                          }
                        >
                          {actualNet >= 0 ? "+" : "−"}
                          {fmt(Math.abs(actualNet))}
                        </td>
                        <td className="text-right text-ink-subtle">{fmt(budgetNet)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Top spending categories */}
                <div className="md:col-span-5 border-l pl-8">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
                    Where it went
                  </p>
                  {topCats.length === 0 ? (
                    <p className="text-xs text-ink-faint italic">No spending recorded.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {topCats.map(([cat, amt]) => {
                        const pct = totalCatSpend > 0 ? (amt / totalCatSpend) * 100 : 0;
                        const budgetForCat =
                          budget?.lines?.find((l) => l.label === cat)?.amount ?? 0;
                        const overBudget = budgetForCat > 0 && amt > budgetForCat;
                        return (
                          <li key={cat}>
                            <Link
                              prefetch={false}
                              href={txParams({ category: cat })}
                              className="flex items-baseline justify-between gap-2 hover:bg-paper-darker -mx-2 px-2 py-1 transition-colors"
                            >
                              <span className="truncate">
                                {cat}
                                {overBudget && (
                                  <span className="ml-2 text-[10px] uppercase tracking-wider text-oxblood">
                                    over
                                  </span>
                                )}
                              </span>
                              <span className="font-mono text-sm whitespace-nowrap">
                                {fmt(amt)}
                                <span className="text-ink-faint ml-2 text-xs">
                                  {pct.toFixed(0)}%
                                </span>
                              </span>
                            </Link>
                            <div className="ml-2 mr-2 h-[2px] bg-paper-darker mt-0.5 mb-1">
                              <div
                                className="h-full bg-oxblood"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Asset movement + asset-vs-budget */}
                <div className="md:col-span-12 mt-2 pt-4 border-t">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mb-3">
                    Asset movement & target
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
                    <div>
                      <p className="text-xs text-ink-subtle">
                        Saving change (from cash flow)
                      </p>
                      <p
                        className={
                          "font-mono text-lg mt-1 " +
                          (savingChange >= 0 ? "text-jade-bright" : "text-oxblood-bright")
                        }
                      >
                        {savingChange >= 0 ? "+" : "−"}
                        {fmt(Math.abs(savingChange))}
                      </p>
                    </div>
                    {otherAssetChange != null && (
                      <div>
                        <p className="text-xs text-ink-subtle">
                          Investments change (NAV &middot; contributions)
                        </p>
                        <p
                          className={
                            "font-mono text-lg mt-1 " +
                            (otherAssetChange >= 0
                              ? "text-jade-bright"
                              : "text-oxblood-bright")
                          }
                        >
                          {otherAssetChange >= 0 ? "+" : "−"}
                          {fmt(Math.abs(otherAssetChange))}
                        </p>
                      </div>
                    )}
                    {(() => {
                      const isCurrent = m === currentMonth;
                      const hasSnapshot = snap?.last != null;
                      const actualNw = actualNwByMonth.get(m) ?? null;
                      const isEstimated = !isCurrent && !hasSnapshot && actualNw != null;
                      const expected = budget?.total_nw ?? forecast?.total_networth ?? null;
                      if (expected == null && actualNw == null) return null;
                      return (
                        <>
                          <div>
                            <p className="text-xs text-ink-subtle">
                              Net worth (actual)
                              {isCurrent && (
                                <span className="ml-1 text-[10px] uppercase tracking-wider text-oxblood">
                                  live
                                </span>
                              )}
                              {isEstimated && (
                                <span
                                  className="ml-1 text-[10px] uppercase tracking-wider text-ink-faint"
                                  title="No daily snapshot for this month — estimated from today's total minus subsequent cash flow"
                                >
                                  est.
                                </span>
                              )}
                            </p>
                            <p className="font-mono text-lg mt-1">
                              {actualNw != null ? fmt(actualNw) : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-ink-subtle">
                              Net worth (target / budget)
                            </p>
                            <p className="font-mono text-lg mt-1 text-ink-subtle">
                              {expected != null ? fmt(expected) : "—"}
                            </p>
                            {expected != null && actualNw != null && (
                              <p
                                className={
                                  "text-xs font-mono mt-1 " +
                                  (actualNw >= expected
                                    ? "text-jade-bright"
                                    : "text-oxblood-bright")
                                }
                              >
                                vs target:{" "}
                                {actualNw >= expected ? "+" : "−"}
                                {fmt(Math.abs(actualNw - expected))} (
                                {actualNw >= expected ? "+" : "−"}
                                {Math.abs(((actualNw - expected) / expected) * 100).toFixed(
                                  1
                                )}
                                %)
                              </p>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </main>
    </AppShell>
  );
}
