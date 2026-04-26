"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TxType =
  | "auto"
  | "income"
  | "expense"
  | "transfer"
  | "transfer_in"
  | "cc_payment"
  | "cc_payment_received"
  | "reimbursement"
  | "asset_buy";

export type CommitTx = {
  occurred_at: string;
  description: string;
  amount: number;
  currency: string;
  direction: "credit" | "debit";
  category?: string | null;
  tx_type?: TxType;
  account_id?: string | null;
  // Phase 9 — cross-workspace + asset buy
  target_workspace_id?: string | null;
  target_asset_id?: string | null;
  units_delta?: number | null;
};

function dupKey(t: { occurred_at: string; amount: number; direction: string; description: string }) {
  const desc = (t.description ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${t.occurred_at}|${Math.round(Number(t.amount) * 100) / 100}|${t.direction}|${desc}`;
}

export async function checkForDuplicates(
  workspaceId: string,
  candidates: { occurred_at: string; amount: number; direction: string; description: string }[]
): Promise<boolean[]> {
  if (candidates.length === 0) return [];
  const supabase = await createClient();
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

  // Server-side dedupe
  const candidates = txs.map((t) => ({
    occurred_at: t.occurred_at,
    amount: t.amount,
    direction: t.direction,
    description: t.description,
  }));
  const dupFlags = await checkForDuplicates(workspaceId, candidates);
  const filtered = txs.filter((_, i) => !dupFlags[i]);
  const skipped = txs.length - filtered.length;

  if (filtered.length === 0) {
    return { error: null, count: 0, skipped, paired: 0, asset_updates: 0 };
  }

  // Insert source rows in source workspace, capture inserted IDs in input order.
  const sourceRows = filtered.map((t) => ({
    workspace_id: workspaceId,
    occurred_at: t.occurred_at,
    description: t.description,
    amount: t.amount,
    currency: t.currency,
    direction: t.direction,
    category: t.category ?? null,
    tx_type: t.tx_type ?? "auto",
    account_id: t.account_id ?? null,
    target_workspace_id: t.target_workspace_id ?? null,
    target_asset_id: t.target_asset_id ?? null,
    units_delta: t.units_delta ?? null,
  }));

  const { error: insErr, data: inserted } = await supabase
    .from("transactions")
    .insert(sourceRows)
    .select("id");
  if (insErr || !inserted) {
    return { error: insErr?.message ?? "Insert failed", count: 0, skipped, paired: 0, asset_updates: 0 };
  }

  let paired = 0;
  let assetUpdates = 0;
  const errors: string[] = [];

  // For each row that needs side effects, walk paired with its inserted id
  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i];
    const sourceId = inserted[i]?.id as string | undefined;
    if (!sourceId) continue;

    // Cross-workspace transfer → create paired transfer_in row
    if (t.tx_type === "transfer" && t.target_workspace_id) {
      // Verify target workspace owned by user (RLS will also enforce, but explicit check is clearer)
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id")
        .eq("id", t.target_workspace_id)
        .maybeSingle();
      if (!ws) {
        errors.push(`Target workspace ${t.target_workspace_id} not found / not yours`);
        continue;
      }
      const { data: pair, error: pairErr } = await supabase
        .from("transactions")
        .insert({
          workspace_id: t.target_workspace_id,
          occurred_at: t.occurred_at,
          description: t.description,
          amount: t.amount,
          currency: t.currency,
          direction: "credit",
          category: t.category ?? null,
          tx_type: "transfer_in",
          account_id: null,
          linked_tx_id: sourceId,
        })
        .select("id")
        .single();
      if (pairErr || !pair) {
        errors.push(`Pair insert failed: ${pairErr?.message}`);
        continue;
      }
      // Back-link source row to pair
      await supabase
        .from("transactions")
        .update({ linked_tx_id: pair.id })
        .eq("id", sourceId);
      paired++;
    }

    // Asset buy → bump asset.units by units_delta
    if (t.tx_type === "asset_buy" && t.target_asset_id && t.units_delta != null) {
      const { data: asset } = await supabase
        .from("assets")
        .select("units")
        .eq("id", t.target_asset_id)
        .maybeSingle();
      if (asset) {
        const newUnits = Number(asset.units ?? 0) + Number(t.units_delta);
        const { error: updErr } = await supabase
          .from("assets")
          .update({ units: newUnits, updated_at: new Date().toISOString() })
          .eq("id", t.target_asset_id);
        if (updErr) errors.push(`Asset update: ${updErr.message}`);
        else assetUpdates++;
      }
    }
  }

  revalidatePath("/statements");
  revalidatePath("/transactions");
  revalidatePath("/projection");
  revalidatePath("/");

  return {
    error: errors.length > 0 ? errors.join("; ") : null,
    count: inserted.length,
    skipped,
    paired,
    asset_updates: assetUpdates,
  };
}

export async function updateTransaction(
  id: string,
  patch: {
    tx_type?: string;
    category?: string | null;
    description?: string;
    amount?: number;
    occurred_at?: string;
  }
) {
  const supabase = await createClient();

  // Fetch current row to detect side effects (paired + asset_buy)
  const { data: current } = await supabase
    .from("transactions")
    .select(
      "id, tx_type, amount, occurred_at, description, linked_tx_id, target_asset_id, units_delta"
    )
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("transactions").update(patch).eq("id", id);
  if (error) return { error: error.message };

  // Mirror amount/date changes to paired leg
  if (current?.linked_tx_id && (patch.amount != null || patch.occurred_at != null || patch.description != null)) {
    const mirrorPatch: Record<string, unknown> = {};
    if (patch.amount != null) mirrorPatch.amount = patch.amount;
    if (patch.occurred_at != null) mirrorPatch.occurred_at = patch.occurred_at;
    if (patch.description != null) mirrorPatch.description = patch.description;
    if (Object.keys(mirrorPatch).length > 0) {
      await supabase.from("transactions").update(mirrorPatch).eq("id", current.linked_tx_id);
    }
  }

  // If tx_type changed away from transfer/transfer_in, drop the orphan pair
  if (
    current &&
    current.linked_tx_id &&
    patch.tx_type &&
    patch.tx_type !== "transfer" &&
    patch.tx_type !== "transfer_in"
  ) {
    await supabase.from("transactions").delete().eq("id", current.linked_tx_id);
  }

  revalidatePath("/transactions");
  revalidatePath("/projection");
  return { error: null };
}

export async function deleteTransactions(ids: string[]) {
  if (ids.length === 0) return { error: null, count: 0 };
  const supabase = await createClient();

  // Reverse asset buys + collect linked pair ids
  const { data: rows } = await supabase
    .from("transactions")
    .select("id, tx_type, target_asset_id, units_delta, linked_tx_id")
    .in("id", ids);

  const allToDelete = new Set<string>(ids);
  for (const r of rows ?? []) {
    if (r.tx_type === "asset_buy" && r.target_asset_id && r.units_delta != null) {
      const { data: asset } = await supabase
        .from("assets")
        .select("units")
        .eq("id", r.target_asset_id)
        .maybeSingle();
      if (asset) {
        await supabase
          .from("assets")
          .update({ units: Number(asset.units ?? 0) - Number(r.units_delta) })
          .eq("id", r.target_asset_id);
      }
    }
    if (r.linked_tx_id) allToDelete.add(r.linked_tx_id as string);
  }

  const { error, data } = await supabase
    .from("transactions")
    .delete()
    .in("id", Array.from(allToDelete))
    .select("id");
  if (error) return { error: error.message, count: 0 };

  revalidatePath("/transactions");
  revalidatePath("/projection");
  revalidatePath("/");
  return { error: null, count: data?.length ?? allToDelete.size };
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
