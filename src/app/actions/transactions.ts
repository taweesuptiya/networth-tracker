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

function dupKey(t: { occurred_at: string; amount: number; direction: string; description: string }) {
  // Normalize: trim + collapse whitespace + lowercase, round amount to 2dp
  const desc = (t.description ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${t.occurred_at}|${Math.round(Number(t.amount) * 100) / 100}|${t.direction}|${desc}`;
}

export async function checkForDuplicates(
  workspaceId: string,
  candidates: { occurred_at: string; amount: number; direction: string; description: string }[]
): Promise<boolean[]> {
  if (candidates.length === 0) return [];
  const supabase = await createClient();
  // Find earliest/latest occurred_at in candidates to bound the query
  const dates = candidates.map((c) => c.occurred_at).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const { data: existing } = await supabase
    .from("transactions")
    .select("occurred_at, amount, direction, description")
    .eq("workspace_id", workspaceId)
    .gte("occurred_at", from)
    .lte("occurred_at", to);
  const existingKeys = new Set(
    (existing ?? []).map((e) =>
      dupKey({
        occurred_at: String(e.occurred_at),
        amount: Number(e.amount),
        direction: String(e.direction),
        description: String(e.description ?? ""),
      })
    )
  );
  return candidates.map((c) => existingKeys.has(dupKey(c)));
}

export async function commitTransactions(workspaceId: string, txs: CommitTx[]) {
  const supabase = await createClient();

  // Server-side dedupe: skip rows that already exist in DB.
  const candidates = txs.map((t) => ({
    occurred_at: t.occurred_at,
    amount: t.amount,
    direction: t.direction,
    description: t.description,
  }));
  const dupFlags = await checkForDuplicates(workspaceId, candidates);
  const filtered = txs.filter((_, i) => !dupFlags[i]);
  const skipped = txs.length - filtered.length;

  const rows = filtered.map((t) => ({
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
  if (rows.length === 0) {
    return { error: null, count: 0, skipped };
  }
  const { error, data } = await supabase.from("transactions").insert(rows).select("id");
  if (error) return { error: error.message, count: 0, skipped };
  revalidatePath("/statements");
  revalidatePath("/transactions");
  return { error: null, count: data?.length ?? rows.length, skipped };
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
