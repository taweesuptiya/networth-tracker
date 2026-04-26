import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchYahooMonthly,
  fetchFinnomenaMonthly,
  monthsBetween,
  monthFirstDay,
} from "@/lib/historical-prices";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  workspace_id: string;
  from_month: string; // YYYY-MM
  to_month?: string; // YYYY-MM, default current
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: Body = await request.json();
    const fromMonth = body.from_month;
    const toMonth = body.to_month ?? new Date().toISOString().slice(0, 7);
    const months = monthsBetween(fromMonth, toMonth);

    // Load all assets in this workspace
    const { data: assets, error: assetErr } = await supabase
      .from("assets")
      .select("id, name, symbol, price_source, units, manual_value, currency")
      .eq("workspace_id", body.workspace_id);
    if (assetErr) {
      return NextResponse.json({ error: assetErr.message }, { status: 500 });
    }

    type AssetRow = {
      id: string;
      name: string;
      symbol: string | null;
      price_source: string;
      units: number | null;
      manual_value: number | null;
      currency: string;
    };

    let assetsProcessed = 0;
    let snapshotsWritten = 0;
    const errors: string[] = [];

    for (const a of (assets ?? []) as AssetRow[]) {
      assetsProcessed++;
      const units = Number(a.units ?? 0);
      const manualValue = Number(a.manual_value ?? 0);

      let monthlyPrices: { month: string; price: number; currency: string }[] = [];

      if (a.price_source === "yahoo" && a.symbol && units > 0) {
        monthlyPrices = await fetchYahooMonthly(a.symbol, fromMonth, toMonth);
      } else if (a.price_source === "finnomena" && a.symbol && units > 0) {
        monthlyPrices = await fetchFinnomenaMonthly(a.symbol, fromMonth, toMonth);
      }

      const records: {
        workspace_id: string;
        asset_id: string;
        month: string;
        price: number | null;
        units: number | null;
        value: number;
        currency: string;
        source: string;
      }[] = [];

      if (monthlyPrices.length > 0) {
        for (const p of monthlyPrices) {
          records.push({
            workspace_id: body.workspace_id,
            asset_id: a.id,
            month: monthFirstDay(p.month),
            price: p.price,
            units,
            value: p.price * units,
            currency: p.currency || a.currency,
            source: a.price_source,
          });
        }
      } else {
        // Manual or no historical data: write the same current value for every month as a flat baseline
        const flatValue =
          manualValue > 0 ? manualValue : units * 0;
        if (flatValue > 0) {
          for (const m of months) {
            records.push({
              workspace_id: body.workspace_id,
              asset_id: a.id,
              month: monthFirstDay(m),
              price: null,
              units: null,
              value: flatValue,
              currency: a.currency,
              source: "manual",
            });
          }
        }
      }

      if (records.length === 0) continue;

      const { error: upErr } = await supabase
        .from("monthly_asset_snapshots")
        .upsert(records, { onConflict: "workspace_id,asset_id,month" });
      if (upErr) {
        errors.push(`${a.name}: ${upErr.message}`);
      } else {
        snapshotsWritten += records.length;
      }
    }

    return NextResponse.json({
      assets_processed: assetsProcessed,
      snapshots_written: snapshotsWritten,
      errors,
    });
  } catch (err) {
    console.error("backfill error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
