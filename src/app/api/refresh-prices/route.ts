import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPriceForSource, fetchUsdToThb } from "@/lib/prices";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({} as { workspaceId?: string }));
  const workspaceId = body.workspaceId;

  // Auto-refresh assets with a non-manual price source (scoped to workspace if given).
  let q = supabase
    .from("assets")
    .select("id, name, symbol, price_source, units, currency, workspace_id")
    .neq("price_source", "manual");
  if (workspaceId) q = q.eq("workspace_id", workspaceId);

  const { data: assets, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ id: string; name: string; ok: boolean; price?: number; error?: string }> = [];

  for (const a of assets ?? []) {
    const r = await fetchPriceForSource(a.price_source, a.symbol);
    if ("error" in r) {
      results.push({ id: a.id, name: a.name, ok: false, error: r.error });
      continue;
    }
    const { error: updErr } = await supabase
      .from("assets")
      .update({ price_per_unit: r.price, updated_at: new Date().toISOString() })
      .eq("id", a.id);
    if (updErr) {
      results.push({ id: a.id, name: a.name, ok: false, error: updErr.message });
      continue;
    }
    await supabase.from("price_history").insert({
      asset_id: a.id,
      price: r.price,
      currency: r.currency,
    });
    results.push({ id: a.id, name: a.name, ok: true, price: r.price });
  }

  // Update USD->THB on workspaces (scope to one if given, else all owned).
  const fx = await fetchUsdToThb();
  if (fx) {
    if (workspaceId) {
      await supabase.from("workspaces").update({ usd_to_thb: fx }).eq("id", workspaceId);
    } else {
      await supabase.from("workspaces").update({ usd_to_thb: fx }).eq("user_id", user.id);
    }
  }

  return NextResponse.json({ results, fx });
}
