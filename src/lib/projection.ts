// Projection engine: takes a config and returns month-by-month rows.
// Mirrors the structure of the user's Excel "Dec25 Networth projection" sheet.

export type ScheduleEntry = { month: string; amount: number };

export type ExpenseLine = {
  label: string;
  monthly: number;
  schedule?: ScheduleEntry[]; // irregular months
};

export type ProjectionConfig = {
  start_month: string; // "2026-01"
  months: number;
  growth: {
    stock_annual: number;
    pvd_annual: number;
    ssf_rmf_annual: number;
  };
  starting: {
    savings: number;
    stock: number;
    pvd: number;
    ssf_rmf: number;
    marriage: number;
  };
  income: {
    salary_monthly: number;
    salary_annual_raise_pct: number;
    rsu_schedule: ScheduleEntry[];
    bonus_stock_schedule: ScheduleEntry[];
    bonus_cash_schedule: ScheduleEntry[];
  };
  deductions: {
    sso_monthly: number;
    provident_pct: number;
    employer_match_pct: number;
    withholding_tax_pct: number;
    stock_tax_pct: number;
    rmf_esg_monthly: number;
  };
  expenses: ExpenseLine[];
};

export type MonthRow = {
  month: string; // "2026-01"
  // Income
  salary: number;
  rsu: number;
  bonus_stock: number;
  bonus_cash: number;
  total_income: number;
  // Deductions
  sso: number;
  provident: number;
  employer: number;
  tax: number;
  rmf_esg: number;
  net_pay: number;
  // Expenses
  expenses: number;
  expense_breakdown: { label: string; amount: number }[];
  // Saves
  net_cash_save: number;
  net_stock_save: number;
  // Asset balances (end of month)
  saving_balance: number;
  stock_balance: number;
  pvd_balance: number;
  ssf_rmf_balance: number;
  marriage_balance: number;
  total_networth: number;
  // Misc
  saving_rate: number; // saved / net pay
};

function findScheduled(schedule: ScheduleEntry[], month: string): number {
  return schedule
    .filter((s) => s.month === month)
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function project(config: ProjectionConfig): MonthRow[] {
  const rows: MonthRow[] = [];
  let salary = config.income.salary_monthly;
  let saving = config.starting.savings;
  let stock = config.starting.stock;
  let pvd = config.starting.pvd;
  let ssf_rmf = config.starting.ssf_rmf;
  let marriage = config.starting.marriage;

  const stockMonthly = config.growth.stock_annual / 12;
  const pvdMonthly = config.growth.pvd_annual / 12;
  const ssfRmfMonthly = config.growth.ssf_rmf_annual / 12;

  let cur = config.start_month;
  for (let i = 0; i < config.months; i++) {
    // Apply annual raise each January (skip the very first month)
    if (i > 0 && cur.endsWith("-01")) {
      salary = salary * (1 + config.income.salary_annual_raise_pct);
    }

    const rsu = findScheduled(config.income.rsu_schedule, cur);
    const bonus_stock = findScheduled(config.income.bonus_stock_schedule, cur);
    const bonus_cash = findScheduled(config.income.bonus_cash_schedule, cur);
    const total_income = salary + rsu + bonus_stock + bonus_cash;

    const sso = config.deductions.sso_monthly;
    const provident = salary * config.deductions.provident_pct;
    const employer = salary * config.deductions.employer_match_pct;
    const wht = (salary + bonus_cash) * config.deductions.withholding_tax_pct;
    const stockTax = (rsu + bonus_stock) * config.deductions.stock_tax_pct;
    const tax = wht + stockTax;
    const rmf_esg = config.deductions.rmf_esg_monthly;
    const net_pay =
      total_income - sso - provident - tax - rmf_esg;

    const expense_breakdown = config.expenses.map((e) => ({
      label: e.label,
      amount: e.monthly + findScheduled(e.schedule ?? [], cur),
    }));
    const expenses = expense_breakdown.reduce((s, e) => s + e.amount, 0);

    const net_cash_save = net_pay - expenses;
    const net_stock_save = rsu + bonus_stock;

    // Compound asset balances first (interest on prior month-end balance)
    saving = saving + net_cash_save;
    saving = saving * (1 + 0); // savings doesn't compound here unless desired

    stock = stock * (1 + stockMonthly) + net_stock_save;
    pvd = pvd * (1 + pvdMonthly) + provident + employer;
    ssf_rmf = ssf_rmf * (1 + ssfRmfMonthly) + rmf_esg;
    // marriage: optional growth; left flat for now

    const total_networth = saving + stock + pvd + ssf_rmf + marriage;
    const saving_rate = net_pay > 0 ? net_cash_save / net_pay : 0;

    rows.push({
      month: cur,
      salary,
      rsu,
      bonus_stock,
      bonus_cash,
      total_income,
      sso,
      provident,
      employer,
      tax,
      rmf_esg,
      net_pay,
      expenses,
      expense_breakdown,
      net_cash_save,
      net_stock_save,
      saving_balance: saving,
      stock_balance: stock,
      pvd_balance: pvd,
      ssf_rmf_balance: ssf_rmf,
      marriage_balance: marriage,
      total_networth,
      saving_rate,
    });

    cur = nextMonth(cur);
  }
  return rows;
}

// Returns the canonical category list per tx_type, derived from the projection config.
// Used to populate dropdowns in the statement uploader and transactions browser
// so that categories stay consistent with the budget tracker.
export function categoriesByTxType(config: ProjectionConfig): Record<string, string[]> {
  const expenseCats = config.expenses.map((e) => e.label);
  return {
    expense: expenseCats,
    // Reimbursements offset an expense category, so they share the same list
    reimbursement: expenseCats,
    income: ["Salary", "RSU", "Bonus stock", "Bonus cash", "Interest/Dividend", "Other income"],
    transfer: [],
    cc_payment: ["KTC card", "UOB card", "Other CC"],
    cc_payment_received: [],
    auto: [...expenseCats, "Salary", "RSU", "Bonus stock", "Bonus cash", "Interest/Dividend"],
  };
}

// Default config seeded from the user's Dec25 Excel projection
export function defaultConfig(): ProjectionConfig {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return {
    start_month: `${year}-${month}`,
    months: 48,
    growth: {
      stock_annual: 0.05,
      pvd_annual: 0.03,
      ssf_rmf_annual: 0.05,
    },
    starting: {
      savings: 100000,
      stock: 0,
      pvd: 966500,
      ssf_rmf: 900000,
      marriage: 0,
    },
    income: {
      salary_monthly: 162900,
      salary_annual_raise_pct: 0.10,
      rsu_schedule: [],
      bonus_stock_schedule: [],
      bonus_cash_schedule: [],
    },
    deductions: {
      sso_monthly: 750,
      provident_pct: 0.05,
      employer_match_pct: 0.10,
      withholding_tax_pct: 0.16,
      stock_tax_pct: 0.16,
      rmf_esg_monthly: 0,
    },
    expenses: [
      { label: "Monthly Subscription", monthly: 2200 },
      { label: "Grab Food + Transport", monthly: 14000 },
      { label: "Housing", monthly: 80000 },
      { label: "Socialize", monthly: 16000 },
      { label: "Date with Jane", monthly: 30000 },
      { label: "Household items", monthly: 1000 },
      { label: "Travel", monthly: 0, schedule: [] },
      { label: "Major Spending", monthly: 0, schedule: [] },
      { label: "Misc", monthly: 5000 },
    ],
  };
}
