"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { defaultConfig, project, type ProjectionConfig } from "@/lib/projection";

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

// Snapshot the current projection as the frozen monthly budget.
// Replaces any previously-saved budget rows for the same months.
export async function saveAsBudget(workspaceId: string, config: ProjectionConfig) {
  const supabase = await createClient();
  const rows = project(config);
  const records = rows.map((r) => ({
    workspace_id: workspaceId,
    month: `${r.month}-01`, // YYYY-MM-DD first of month
    income_budget: r.total_income,
    expense_budget: r.expenses,
    net_save_budget: r.net_cash_save,
    total_networth_budget: r.total_networth,
    expense_lines: r.expense_breakdown,
  }));
  const { error } = await supabase
    .from("monthly_budgets")
    .upsert(records, { onConflict: "workspace_id,month" });
  if (error) return { error: error.message, count: 0 };
  revalidatePath("/projection");
  return { error: null, count: records.length };
}

export async function clearBudget(workspaceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("monthly_budgets")
    .delete()
    .eq("workspace_id", workspaceId);
  if (error) return { error: error.message };
  revalidatePath("/projection");
  return { error: null };
}
