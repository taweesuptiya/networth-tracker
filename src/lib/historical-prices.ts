// Historical price fetchers — month-end values for backfill.

import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance();

export type MonthlyPrice = { month: string; price: number; currency: string };

// Returns the last day of each month between from..to that has a trading-day price (Yahoo).
export async function fetchYahooMonthly(
  symbol: string,
  fromMonth: string, // YYYY-MM
  toMonth: string
): Promise<MonthlyPrice[]> {
  try {
    const period1 = new Date(fromMonth + "-01");
    const [ty, tm] = toMonth.split("-").map(Number);
    const period2 = new Date(ty, tm, 0); // last day of toMonth
    period2.setDate(period2.getDate() + 1);

    const result = (await yahoo.historical(symbol, {
      period1,
      period2,
      interval: "1d",
    })) as Array<{ date: Date; close: number }>;
    if (!Array.isArray(result) || result.length === 0) return [];

    // For each row, last close in each month wins
    const byMonth = new Map<string, number>();
    for (const row of result) {
      if (typeof row.close !== "number") continue;
      const m = row.date.toISOString().slice(0, 7);
      byMonth.set(m, row.close); // overwrite — sorted by date, last wins
    }

    const q = (await yahoo.quote(symbol)) as { currency?: string } | undefined;
    const currency = q?.currency ?? "USD";

    return Array.from(byMonth.entries()).map(([month, price]) => ({
      month,
      price,
      currency,
    }));
  } catch (e) {
    console.error("fetchYahooMonthly failed for", symbol, e);
    return [];
  }
}

// Finnomena NAV history. We request a wide range and bucket by month.
export async function fetchFinnomenaMonthly(
  code: string,
  fromMonth: string,
  toMonth: string
): Promise<MonthlyPrice[]> {
  // finnomena's range param: 1M, 3M, 6M, 1Y, 3Y, 5Y, 10Y, ALL
  // Pick range that covers fromMonth..now.
  const fromDate = new Date(fromMonth + "-01");
  const monthsBack = Math.ceil(
    (Date.now() - fromDate.getTime()) / (1000 * 60 * 60 * 24 * 31)
  );
  const range =
    monthsBack <= 1
      ? "1M"
      : monthsBack <= 3
        ? "3M"
        : monthsBack <= 6
          ? "6M"
          : monthsBack <= 12
            ? "1Y"
            : monthsBack <= 36
              ? "3Y"
              : monthsBack <= 60
                ? "5Y"
                : "10Y";
  const url = `https://www.finnomena.com/fn3/api/fund/v2/public/funds/${encodeURIComponent(
    code
  )}/nav/q?range=${range}`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 networth-tracker" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    const navs = json?.data?.navs;
    if (!Array.isArray(navs)) return [];

    // For each month in range, take the LAST nav entry of that month
    const byMonth = new Map<string, number>();
    for (const n of navs) {
      const date = String(n.date).slice(0, 10);
      const m = date.slice(0, 7);
      const price = Number(n.value);
      if (!Number.isFinite(price) || price <= 0) continue;
      // Sorted by date asc, so later writes win = last NAV of the month
      byMonth.set(m, price);
    }

    // Filter to requested range
    const out: MonthlyPrice[] = [];
    for (const [m, price] of byMonth.entries()) {
      if (m >= fromMonth && m <= toMonth) {
        out.push({ month: m, price, currency: "THB" });
      }
    }
    return out.sort((a, b) => a.month.localeCompare(b.month));
  } catch (e) {
    console.error("fetchFinnomenaMonthly failed for", code, e);
    return [];
  }
}

// Helper: returns "YYYY-MM-01" for month string.
export function monthFirstDay(m: string): string {
  return `${m}-01`;
}

// Generate the inclusive list of YYYY-MM strings between two months.
export function monthsBetween(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  const [fy, fm] = fromMonth.split("-").map(Number);
  const [ty, tm] = toMonth.split("-").map(Number);
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
