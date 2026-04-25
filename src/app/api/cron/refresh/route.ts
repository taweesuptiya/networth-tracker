// Daily cron endpoint. Vercel calls this on the schedule defined in vercel.json.
// Authenticated via the CRON_SECRET header (set in Vercel project env vars).
// Refreshes prices for ALL users' non-manual assets using the service-role key
// (bypasses RLS so the cron can touch every workspace).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchPriceForSource, fetchUsdToThb } from "@/lib/prices";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: assets } = await admin
    .from("assets")
    .select("id, symbol, price_source")
    .neq("price_source", "manual");

  let ok = 0;
  let fail = 0;
  for (const a of assets ?? []) {
    const r = await fetchPriceForSource(a.price_source, a.symbol);
    if ("error" in r) {
      fail++;
      continue;
    }
    await admin
      .from("assets")
      .update({ price_per_unit: r.price, updated_at: new Date().toISOString() })
      .eq("id", a.id);
    await admin.from("price_history").insert({
      asset_id: a.id,
      price: r.price,
      currency: r.currency,
    });
    ok++;
  }

  const fx = await fetchUsdToThb();
  if (fx) {
    await admin.from("workspaces").update({ usd_to_thb: fx }).neq("id", "00000000-0000-0000-0000-000000000000");
  }

  // Snapshot net worth per workspace (for Phase 5 charts).
  const { data: workspaces } = await admin
    .from("workspaces")
    .select("id, base_currency, usd_to_thb");
  for (const w of workspaces ?? []) {
    const { data: rows } = await admin
      .from("assets")
      .select("units, price_per_unit, manual_value, currency")
      .eq("workspace_id", w.id);
    const total = (rows ?? []).reduce((s, a) => {
      const raw = a.manual_value != null
        ? Number(a.manual_value)
        : Number(a.units ?? 0) * Number(a.price_per_unit ?? 0);
      const v = a.currency === w.base_currency
        ? raw
        : a.currency === "USD" && w.base_currency === "THB"
          ? raw * Number(w.usd_to_thb ?? 32.33)
          : a.currency === "THB" && w.base_currency === "USD"
            ? raw / Number(w.usd_to_thb ?? 32.33)
            : raw;
      return s + v;
    }, 0);
    await admin.from("networth_snapshots").insert({
      workspace_id: w.id,
      total_value: total,
      currency: w.base_currency,
    });
  }

  return NextResponse.json({ ok, fail, fx });
}
