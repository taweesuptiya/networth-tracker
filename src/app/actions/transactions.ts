"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CommitTx = {
  occurred_at: string;
  description: string;
  amount: number;
  currency: string;
  direction: "credit" | "debit";
  category?: string | null;
  tx_type?: "income" | "expense" | "transfer" | "cc_payment" | "cc_payment_received" | "reimbursement";
  account_id?: string | null;
};

export async function commitTransactions(workspaceId: string, txs: CommitTx[]) {
  const supabase = await createClient();
  const rows = txs.map((t) => ({
    workspace_id: workspaceId,
    occurred_at: t.occurred_at,
    description: t.description,
    amount: t.amount,
    currency: t.currency,
    direction: t.direction,
    category: t.category ?? null,
    tx_type: t.tx_type ?? "auto",
    account_id: t.account_id ?? null,
  }));
  const { error, data } = await supabase.from("transactions").insert(rows).select("id");
  if (error) return { error: error.message, count: 0 };
  revalidatePath("/statements");
  return { error: null, count: data?.length ?? rows.length };
}

export async function updateTransaction(
  id: string,
  patch: { tx_type?: string; category?: string | null; description?: string }
) {
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/transactions");
  revalidatePath("/projection");
  return { error: null };
}

export async function deleteTransactions(ids: string[]) {
  if (ids.length === 0) return { error: null, count: 0 };
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("transactions")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) return { error: error.message, count: 0 };
  revalidatePath("/transactions");
  revalidatePath("/projection");
  return { error: null, count: data?.length ?? ids.length };
}

export async function bulkUpdateTransactions(
  ids: string[],
  patch: { tx_type?: string; category?: string | null }
) {
  if (ids.length === 0) return { error: null, count: 0 };
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("transactions")
    .update(patch)
    .in("id", ids)
    .select("id");
  if (error) return { error: error.message, count: 0 };
  revalidatePath("/transactions");
  revalidatePath("/projection");
  return { error: null, count: data?.length ?? ids.length };
}
