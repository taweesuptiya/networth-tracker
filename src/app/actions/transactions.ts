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
