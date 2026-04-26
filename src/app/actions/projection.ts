"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  defaultConfig,
  defaultMarriageConfig,
  isMarriageConfig,
  project,
  projectMarriage,
  type ProjectionConfig,
  type MarriageProjectionConfig,
} from "@/lib/projection";

export type AnyProjectionConfig = ProjectionConfig | MarriageProjectionConfig;

export async function loadProjectionConfig(workspaceId: string): Promise<AnyProjectionConfig> {
  const supabase = await createClient();

  // Look up workspace to know if it's Marriage or Personal (drives the default)
  const { data: ws } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();
  const isMarriageWorkspace = (ws?.name ?? "").toLowerCase() === "marriage";

  const { data } = await supabase
    .from("projections")
    .select("config")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const stored = data?.config as AnyProjectionConfig | undefined;
  if (stored && Object.keys(stored).length > 0) {
    // If the stored config doesn't have a kind tag yet, infer from workspace name
    const kindTagged = (stored as MarriageProjectionConfig).kind
      ? stored
      : isMarriageWorkspace
        ? ({ ...stored, kind: "marriage" } as MarriageProjectionConfig)
        : ({ ...stored, kind: "personal" } as ProjectionConfig);
    return kindTagged;
  }
  return isMarriageWorkspace ? defaultMarriageConfig() : defaultConfig();
}

export async function saveProjectionConfig(
  workspaceId: string,
  config: AnyProjectionConfig
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
export async function saveAsBudget(workspaceId: string, config: AnyProjectionConfig) {
  const supabase = await createClient();
  let records: {
    workspace_id: string;
    month: string;
    income_budget: number;
    expense_budget: number;
    net_save_budget: number;
    total_networth_budget: number;
    expense_lines: { label: string; amount: number }[];
  }[];
  if (isMarriageConfig(config)) {
    const rows = projectMarriage(config);
    records = rows.map((r) => ({
      workspace_id: workspaceId,
      month: `${r.month}-01`,
      income_budget: r.total_income,
      expense_budget: r.expenses,
      net_save_budget: r.net_cash_save,
      total_networth_budget: r.total_networth,
      expense_lines: r.expense_breakdown,
    }));
  } else {
    const rows = project(config);
    records = rows.map((r) => ({
      workspace_id: workspaceId,
      month: `${r.month}-01`,
      income_budget: r.total_income,
      expense_budget: r.expenses,
      net_save_budget: r.net_cash_save,
      total_networth_budget: r.total_networth,
      expense_lines: r.expense_breakdown,
    }));
  }
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
