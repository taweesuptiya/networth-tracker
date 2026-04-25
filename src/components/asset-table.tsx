"use client";

import { useState, useTransition } from "react";
import { AssetForm, type AssetFormData } from "./asset-form";
import { deleteAsset } from "@/app/actions/assets";
import { rawValue, valueInBase, convertCurrency, formatMoney } from "@/lib/money";

export type Asset = {
  id: string;
  name: string;
  type: string;
  symbol: string | null;
  price_source: string;
  units: number | null;
  price_per_unit: number | null;
  manual_value: number | null;
  cost_basis: number | null;
  currency: string;
  notes: string | null;
};

export function AssetTable({
  workspaceId,
  baseCurrency,
  usdToThb,
  assets,
}: {
  workspaceId: string;
  baseCurrency: string;
  usdToThb: number;
  assets: Asset[];
}) {
  const [editing, setEditing] = useState<AssetFormData | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  function onEdit(a: Asset) {
    setEditing({
      id: a.id,
      name: a.name,
      type: a.type as AssetFormData["type"],
      symbol: a.symbol ?? "",
      price_source: a.price_source as AssetFormData["price_source"],
      units: a.units?.toString() ?? "",
      price_per_unit: a.price_per_unit?.toString() ?? "",
      manual_value: a.manual_value?.toString() ?? "",
      cost_basis: a.cost_basis?.toString() ?? "",
      currency: a.currency,
      notes: a.notes ?? "",
    });
  }

  function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    startTransition(async () => {
      await deleteAsset(id);
    });
  }

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm font-medium text-zinc-500">Assets</h2>
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-1.5 text-xs rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900"
        >
          + Add asset
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3 text-right">Units</th>
              <th className="px-4 py-3 text-right">NAV / Price</th>
              <th className="px-4 py-3 text-right">Cost ({baseCurrency})</th>
              <th className="px-4 py-3 text-right">Value ({baseCurrency})</th>
              <th className="px-4 py-3 text-right">Gain</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  No assets yet. Click + Add asset.
                </td>
              </tr>
            ) : (
              assets.map((a) => {
                const value = valueInBase(a, baseCurrency, usdToThb);
                const cost =
                  a.cost_basis != null
                    ? convertCurrency(Number(a.cost_basis), a.currency, baseCurrency, usdToThb)
                    : null;
                const gain = cost != null ? value - cost : null;
                const gainPct = cost != null && cost !== 0 ? (gain! / cost) * 100 : null;
                const gainColor =
                  gain == null ? "text-zinc-400" : gain >= 0 ? "text-green-600" : "text-red-500";
                return (
                  <tr key={a.id} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-4 py-3">
                      <div>{a.name}</div>
                      {a.symbol && (
                        <div className="text-xs text-zinc-500">{a.symbol}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{a.type}</td>
                    <td className="px-4 py-3 text-right">
                      {a.units != null ? Number(a.units).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {a.price_per_unit != null ? Number(a.price_per_unit).toFixed(4) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500">
                      {cost != null ? formatMoney(cost, baseCurrency) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatMoney(value, baseCurrency)}
                    </td>
                    <td className={`px-4 py-3 text-right ${gainColor}`}>
                      {gain != null ? (
                        <div>
                          <div>{gain >= 0 ? "+" : ""}{formatMoney(gain, baseCurrency)}</div>
                          <div className="text-xs">
                            {gainPct! >= 0 ? "+" : ""}{gainPct!.toFixed(2)}%
                          </div>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => onEdit(a)}
                        className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(a.id, a.name)}
                        disabled={pending}
                        className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {(adding || editing) && (
        <AssetForm
          workspaceId={workspaceId}
          initial={editing ?? undefined}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
