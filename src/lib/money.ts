export type AssetRow = {
  units: number | null;
  price_per_unit: number | null;
  manual_value: number | null;
  debt_balance?: number | null;
  currency: string;
};

/** Market / gross value — ignores any outstanding debt. */
export function grossValue(a: AssetRow): number {
  if (a.manual_value != null) return Number(a.manual_value);
  return (Number(a.units ?? 0)) * (Number(a.price_per_unit ?? 0));
}

/** Equity = market value minus outstanding debt. Use this for net worth. */
export function rawValue(a: AssetRow): number {
  return grossValue(a) - Number(a.debt_balance ?? 0);
}

export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  usdToThb: number
): number {
  if (from === to) return amount;
  if (from === "USD" && to === "THB") return amount * usdToThb;
  if (from === "THB" && to === "USD") return amount / usdToThb;
  return amount;
}

/** Equity in the workspace base currency. */
export function valueInBase(a: AssetRow, baseCurrency: string, usdToThb: number): number {
  const raw = rawValue(a);
  if (a.currency === baseCurrency) return raw;
  if (a.currency === "USD" && baseCurrency === "THB") return raw * usdToThb;
  if (a.currency === "THB" && baseCurrency === "USD") return raw / usdToThb;
  return raw;
}

/** Gross market value in base currency (for gain/appreciation calculations). */
export function grossValueInBase(a: AssetRow, baseCurrency: string, usdToThb: number): number {
  const raw = grossValue(a);
  if (a.currency === baseCurrency) return raw;
  if (a.currency === "USD" && baseCurrency === "THB") return raw * usdToThb;
  if (a.currency === "THB" && baseCurrency === "USD") return raw / usdToThb;
  return raw;
}

export function formatMoney(n: number, currency: string): string {
  const formatted = n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${formatted} ${currency}`;
}
