"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { defaultConfig, type ProjectionConfig } from "@/lib/projection";

export async function loadProjectionConfig(workspaceId: string): Promise<ProjectionConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projections")
    .select("config")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (data?.config && Object.keys(data.config).length > 0) {
    return data.config as ProjectionConfig;
  }
  return defaultConfig();
}

export async function saveProjectionConfig(
  workspaceId: string,
  config: ProjectionConfig
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projections")
    .upsert({ workspace_id: workspaceId, config, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/projection");
  return { error: null };
}
