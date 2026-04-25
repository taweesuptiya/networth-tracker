"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AssetInput = {
  workspace_id: string;
  name: string;
  type: "Stock" | "Fund" | "Cash" | "House" | "Crypto" | "Other";
  symbol?: string | null;
  price_source: "yahoo" | "finnomena" | "manual";
  units?: number | null;
  price_per_unit?: number | null;
  manual_value?: number | null;
  currency: string;
  notes?: string | null;
};

export async function createAsset(input: AssetInput) {
  const supabase = await createClient();
  const { error } = await supabase.from("assets").insert(input);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { error: null };
}

export async function updateAsset(id: string, input: Partial<AssetInput>) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("assets")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { error: null };
}

export async function deleteAsset(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("assets").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { error: null };
}

export async function updateFxRate(workspaceId: string, usdToThb: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspaces")
    .update({ usd_to_thb: usdToThb })
    .eq("id", workspaceId);
  if (error) return { error: error.message };
  revalidatePath("/");
  return { error: null };
}
