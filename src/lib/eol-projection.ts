export type EolRowInput = {
  year: number;
  event?: string;
  company?: string;
  monthlySalary: number;
  salaryGrowthPct: number;
  cashBonus: number;
  sharesVested: number;
  sharePrice: number;
  monthlyColOverride?: number;
};

export type EolSettings = {
  birthYear: number;
  startYear: number;
  endAge: number;
  startNW: number;
  startLiabilities: number;
  annualLiabPayment: number;
  returnRate: number;
  liabRate: number;
  defaultTaxRate: number;
  defaultMonthlyCoL: number;
  colGrowthRate: number;
};

export type EolConfig = EolSettings & { rows: EolRowInput[] };

export type EolCalcRow = EolRowInput & {
  age: number;
  stockValue: number;
  activeIncome: number;
  passiveIncome: number;
  passivePct: number;
  totalIncome: number;
  tax: number;
  afterTax: number;
  annualCoL: number;
  liabBalance: number;
  liabInterest: number;
  savings: number;
  netWorth: number;
};

export const DEFAULT_EOL_SETTINGS: EolSettings = {
  birthYear: 1995,
  startYear: 2025,
  endAge: 75,
  startNW: 2_000_000,
  startLiabilities: 0,
  annualLiabPayment: 0,
  returnRate: 5,
  liabRate: 2.45,
  defaultTaxRate: 16,
  defaultMonthlyCoL: 60_000,
  colGrowthRate: 0,
};

export function initRows(settings: EolSettings): EolRowInput[] {
  const rows: EolRowInput[] = [];
  for (let y = settings.startYear; y <= settings.startYear + (settings.endAge - (settings.startYear - settings.birthYear)); y++) {
    rows.push({
      year: y,
      monthlySalary: 0,
      salaryGrowthPct: 0,
      cashBonus: 0,
      sharesVested: 0,
      sharePrice: 0,
    });
  }
  return rows;
}

export function calculateEol(config: EolConfig): EolCalcRow[] {
  const { returnRate, liabRate, defaultTaxRate, defaultMonthlyCoL, colGrowthRate } = config;
  let nw = config.startNW;
  let liab = config.startLiabilities;
  const result: EolCalcRow[] = [];

  for (let i = 0; i < config.rows.length; i++) {
    const row = config.rows[i];
    const age = row.year - config.birthYear;

    const passive = nw * (returnRate / 100);
    const stockValue = row.sharesVested * row.sharePrice;
    const active = row.monthlySalary * 12 + row.cashBonus + stockValue;
    const total = active + passive;
    const passivePct = total > 0 ? (passive / total) * 100 : 0;
    const tax = total * (defaultTaxRate / 100);
    const afterTax = total - tax;

    const colGrowthMultiplier = Math.pow(1 + colGrowthRate / 100, i);
    const monthlyCoL = row.monthlyColOverride ?? defaultMonthlyCoL * colGrowthMultiplier;
    const annualCoL = monthlyCoL * 12;

    const liabInterest = liab * (liabRate / 100);
    const payment = Math.min(liab, config.annualLiabPayment);
    const newLiab = Math.max(0, liab - Math.max(0, payment - liabInterest));

    const savings = afterTax - annualCoL - liabInterest;
    nw = nw + savings;

    result.push({
      ...row,
      age,
      stockValue,
      activeIncome: active,
      passiveIncome: passive,
      passivePct,
      totalIncome: total,
      tax,
      afterTax,
      annualCoL,
      liabBalance: liab,
      liabInterest,
      savings,
      netWorth: nw,
    });

    liab = newLiab;
  }

  return result;
}
