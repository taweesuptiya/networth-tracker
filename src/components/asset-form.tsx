"use client";

import { useState, useTransition } from "react";
import { createAsset, updateAsset, type AssetInput } from "@/app/actions/assets";

type AssetType = AssetInput["type"];
type PriceSource = AssetInput["price_source"];

const TYPES: AssetType[] = ["Stock", "Fund", "Cash", "House", "Crypto", "Other"];
const SOURCES: PriceSource[] = ["manual", "yahoo", "finnomena"];

export type AssetFormData = {
  id?: string;
  name: string;
  type: AssetType;
  symbol: string;
  price_source: PriceSource;
  units: string;
  price_per_unit: string;
  manual_value: string;
  currency: string;
  notes: string;
};

const empty: AssetFormData = {
  name: "",
  type: "Stock",
  symbol: "",
  price_source: "manual",
  units: "",
  price_per_unit: "",
  manual_value: "",
  currency: "THB",
  notes: "",
};

export function AssetForm({
  workspaceId,
  initial,
  onClose,
}: {
  workspaceId: string;
  initial?: AssetFormData;
  onClose: () => void;
}) {
  const [data, setData] = useState<AssetFormData>(initial ?? empty);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof AssetFormData>(key: K, value: AssetFormData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: AssetInput = {
      workspace_id: workspaceId,
      name: data.name.trim(),
      type: data.type,
      symbol: data.symbol.trim() || null,
      price_source: data.price_source,
      units: data.units === "" ? null : Number(data.units),
      price_per_unit: data.price_per_unit === "" ? null : Number(data.price_per_unit),
      manual_value: data.manual_value === "" ? null : Number(data.manual_value),
      currency: data.currency.trim() || "THB",
      notes: data.notes.trim() || null,
    };

    startTransition(async () => {
      const res = data.id
        ? await updateAsset(data.id, payload)
        : await createAsset(payload);
      if (res.error) setError(res.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">
          {data.id ? "Edit asset" : "Add asset"}
        </h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 flex flex-col gap-1">
            Name
            <input
              required
              value={data.name}
              onChange={(e) => update("name", e.target.value)}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
            />
          </label>

          <label className="flex flex-col gap-1">
            Type
            <select
              value={data.type}
              onChange={(e) => update("type", e.target.value as AssetType)}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            Currency
            <select
              value={data.currency}
              onChange={(e) => update("currency", e.target.value)}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
            >
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            Symbol / fund code
            <input
              value={data.symbol}
              onChange={(e) => update("symbol", e.target.value)}
              placeholder="GRAB, K-FIRMF"
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
            />
          </label>

          <label className="flex flex-col gap-1">
            Price source
            <select
              value={data.price_source}
              onChange={(e) => update("price_source", e.target.value as PriceSource)}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            Units
            <input
              type="number"
              step="any"
              value={data.units}
              onChange={(e) => update("units", e.target.value)}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
            />
          </label>

          <label className="flex flex-col gap-1">
            Price / unit
            <input
              type="number"
              step="any"
              value={data.price_per_unit}
              onChange={(e) => update("price_per_unit", e.target.value)}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
            />
          </label>

          <label className="col-span-2 flex flex-col gap-1">
            Manual total value (overrides units × price)
            <input
              type="number"
              step="any"
              value={data.manual_value}
              onChange={(e) => update("manual_value", e.target.value)}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
            />
          </label>

          <label className="col-span-2 flex flex-col gap-1">
            Notes
            <input
              value={data.notes}
              onChange={(e) => update("notes", e.target.value)}
              className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5"
            />
          </label>

          {error && <p className="col-span-2 text-red-500 text-xs">{error}</p>}

          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-3 py-1.5 text-sm rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
