import yahooFinance from "yahoo-finance2";

export type PriceResult = {
  price: number;
  currency: string;
  source: string;
} | { error: string };

export async function fetchYahoo(symbol: string): Promise<PriceResult> {
  try {
    const q = (await yahooFinance.quote(symbol)) as {
      regularMarketPrice?: number;
      currency?: string;
    } | undefined;
    const price = q?.regularMarketPrice;
    const currency = q?.currency ?? "USD";
    if (typeof price !== "number") return { error: `No price for ${symbol}` };
    return { price, currency, source: "yahoo" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchUsdToThb(): Promise<number | null> {
  const res = await fetchYahoo("THB=X");
  if ("error" in res) return null;
  return res.price;
}

// Best-effort scraper for Thai mutual fund NAV via finnomena's public API.
// Fund codes use the AMC's official code (e.g., K-FIRMF, TAIRMF-A).
// If finnomena's structure changes, this returns null and the user falls back to manual.
export async function fetchThaiFundNav(code: string): Promise<PriceResult> {
  const url = `https://www.finnomena.com/fn3/api/fund/v2/public/funds/${encodeURIComponent(code)}/nav/q?range=1M`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "networth-tracker/0.1" },
      cache: "no-store",
    });
    if (!res.ok) return { error: `finnomena ${res.status}` };
    const json = await res.json();
    // Expected: { data: [ { date, value }, ... ] } — get last point.
    const data = json?.data ?? json?.navList ?? [];
    const last = Array.isArray(data) && data.length > 0 ? data[data.length - 1] : null;
    const price = Number(last?.value ?? last?.nav ?? last?.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { error: `Could not parse NAV for ${code}` };
    }
    return { price, currency: "THB", source: "finnomena" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchPriceForSource(
  source: string,
  symbol: string | null
): Promise<PriceResult> {
  if (!symbol) return { error: "No symbol" };
  if (source === "yahoo") return fetchYahoo(symbol);
  if (source === "finnomena") return fetchThaiFundNav(symbol);
  return { error: `Unsupported source: ${source}` };
}
