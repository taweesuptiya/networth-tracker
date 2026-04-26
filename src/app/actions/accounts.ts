"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { defaultRules } from "@/lib/tx-rules";

export async function createAccount(input: {
  workspace_id: string;
  name: string;
  type: "savings" | "credit_card" | "cash";
  last4?: string;
  notes?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").insert(input);
  if (error) return { error: error.message };
  revalidatePath("/accounts");
  revalidatePath("/statements");
  return { error: null };
}

export async function deleteAccount(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/accounts");
  return { error: null };
}

export async function createRule(input: {
  workspace_id: string;
  priority: number;
  pattern: string;
  match_type: "contains" | "regex";
  applies_to_account_type: "all" | "savings" | "credit_card" | "cash";
  applies_to_direction: "all" | "credit" | "debit";
  set_tx_type: "income" | "expense" | "transfer" | "transfer_in" | "asset_buy" | "cc_payment" | "cc_payment_received" | "reimbursement";
  set_category: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("tx_rules").insert({ ...input, enabled: true });
  if (error) return { error: error.message };
  revalidatePath("/accounts");
  return { error: null };
}

export async function deleteRule(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tx_rules").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/accounts");
  return { error: null };
}

export async function saveAiInstructions(workspaceId: string, instructions: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspaces")
    .update({ ai_categorization_instructions: instructions })
    .eq("id", workspaceId);
  if (error) return { error: error.message };
  revalidatePath("/accounts");
  return { error: null };
}

export async function seedDefaultRules(workspaceId: string) {
  const supabase = await createClient();
  const rows = defaultRules.map((r) => ({ ...r, workspace_id: workspaceId, enabled: true }));
  const { error } = await supabase.from("tx_rules").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/accounts");
  return { error: null };
}
