"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_EOL_SETTINGS,
  initRows,
  type EolConfig,
} from "@/lib/eol-projection";

export async function loadEolConfig(workspaceId: string): Promise<EolConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("eol_projections")
    .select("config")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const stored = data?.config as Partial<EolConfig> | undefined;
  if (stored && stored.rows && stored.rows.length > 0) {
    return {
      ...DEFAULT_EOL_SETTINGS,
      ...stored,
      rows: stored.rows,
    } as EolConfig;
  }

  const settings = { ...DEFAULT_EOL_SETTINGS, ...(stored ?? {}) };
  return { ...settings, rows: initRows(settings) };
}

export async function saveEolConfig(workspaceId: string, config: EolConfig) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("eol_projections")
    .upsert({ workspace_id: workspaceId, config, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/eol");
  return { error: null };
}
