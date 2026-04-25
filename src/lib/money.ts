export type AssetRow = {
  units: number | null;
  price_per_unit: number | null;
  manual_value: number | null;
  currency: string;
};

export function rawValue(a: AssetRow): number {
  if (a.manual_value != null) return Number(a.manual_value);
  return (Number(a.units ?? 0)) * (Number(a.price_per_unit ?? 0));
}

export function valueInBase(a: AssetRow, baseCurrency: string, usdToThb: number): number {
  const raw = rawValue(a);
  if (a.currency === baseCurrency) return raw;
  // Only USD<->THB supported in Phase 2
  if (a.currency === "USD" && baseCurrency === "THB") return raw * usdToThb;
  if (a.currency === "THB" && baseCurrency === "USD") return raw / usdToThb;
  return raw;
}

export function formatMoney(n: number, currency: string): string {
  const formatted = n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${formatted} ${currency}`;
}
