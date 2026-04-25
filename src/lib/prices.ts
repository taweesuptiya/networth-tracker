import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance();

export type PriceResult =
  | { price: number; currency: string; source: string }
  | { error: string };

export async function fetchYahoo(symbol: string): Promise<PriceResult> {
  try {
    const q = (await yahoo.quote(symbol)) as {
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

// Thai mutual fund NAV via finnomena's public API.
// Response: { status, data: { fund_id, short_code, navs: [{ date, value, amount }, ...] } }
export async function fetchThaiFundNav(code: string): Promise<PriceResult> {
  const url = `https://www.finnomena.com/fn3/api/fund/v2/public/funds/${encodeURIComponent(code)}/nav/q?range=1M`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 networth-tracker" },
      cache: "no-store",
    });
    if (!res.ok) return { error: `finnomena ${res.status} for ${code}` };
    const json = await res.json();
    const navs = json?.data?.navs;
    if (!Array.isArray(navs) || navs.length === 0) {
      return { error: `No NAV data returned for ${code}` };
    }
    const last = navs[navs.length - 1];
    const price = Number(last?.value);
    if (!Number.isFinite(price) || price <= 0) {
      return { error: `Could not parse NAV value for ${code}` };
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
