// Projection engine: takes a config and returns month-by-month rows.
// Mirrors the structure of the user's Excel "Dec25 Networth projection" sheet.

export type ScheduleEntry = { month: string; amount: number };

export type ExpenseLine = {
  label: string;
  monthly: number;
  schedule?: ScheduleEntry[]; // irregular months
};

export type ProjectionConfig = {
  kind?: "personal";
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
export function categoriesByTxType(
  config: ProjectionConfig | MarriageProjectionConfig
): Record<string, string[]> {
  if ((config as MarriageProjectionConfig).kind === "marriage") {
    const m = config as MarriageProjectionConfig;
    const expenseCats = m.expense_lines.map((e) => e.label);
    const incomeCats = m.income_lines.map((e) => e.label);
    return {
      expense: expenseCats,
      reimbursement: expenseCats,
      income: incomeCats,
      transfer: ["To Personal", "Asset buy", "Internal"],
      transfer_in: incomeCats,
      asset_buy: [],
      cc_payment: ["UOB card", "Other CC"],
      cc_payment_received: [],
      auto: [...expenseCats, ...incomeCats],
    };
  }
  const p = config as ProjectionConfig;
  const expenseCats = p.expenses.map((e) => e.label);
  return {
    expense: expenseCats,
    reimbursement: expenseCats,
    income: ["Salary", "RSU", "Bonus stock", "Bonus cash", "Interest/Dividend", "Other income"],
    transfer: ["To Marriage", "Asset buy", "Internal"],
    transfer_in: ["From Marriage", "From Personal"],
    asset_buy: [],
    cc_payment: ["KTC card", "UOB card", "Other CC"],
    cc_payment_received: [],
    auto: [...expenseCats, "Salary", "RSU", "Bonus stock", "Bonus cash", "Interest/Dividend"],
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Marriage projection — joint household savings, condo, no salary deductions
// ───────────────────────────────────────────────────────────────────────────

export type MarriageProjectionConfig = {
  kind: "marriage";
  start_month: string;
  months: number;
  starting: {
    savings: number;
    condo_value: number;
    condo_loan: number;
  };
  growth: {
    savings_annual: number;
    condo_annual: number;
  };
  income_lines: ExpenseLine[]; // e.g. Transfer from Personal, Transfer from Jane, Rental
  expense_lines: ExpenseLine[]; // Mortgage, Utilities, Household, Renovation
};

export type MarriageMonthRow = {
  month: string;
  total_income: number;
  income_breakdown: { label: string; amount: number }[];
  expenses: number;
  expense_breakdown: { label: string; amount: number }[];
  net_cash_save: number;
  saving_balance: number;
  condo_value: number;
  condo_loan: number;
  equity: number;
  total_networth: number;
};

export function projectMarriage(config: MarriageProjectionConfig): MarriageMonthRow[] {
  const rows: MarriageMonthRow[] = [];
  let savings = config.starting.savings;
  let condo = config.starting.condo_value;
  const loan = config.starting.condo_loan;
  let cur = config.start_month;

  const savingsMonthly = (config.growth.savings_annual ?? 0) / 12;
  const condoMonthly = (config.growth.condo_annual ?? 0) / 12;

  for (let i = 0; i < config.months; i++) {
    const income_breakdown = config.income_lines.map((e) => ({
      label: e.label,
      amount: e.monthly + findScheduled(e.schedule ?? [], cur),
    }));
    const total_income = income_breakdown.reduce((s, e) => s + e.amount, 0);

    const expense_breakdown = config.expense_lines.map((e) => ({
      label: e.label,
      amount: e.monthly + findScheduled(e.schedule ?? [], cur),
    }));
    const expenses = expense_breakdown.reduce((s, e) => s + e.amount, 0);

    const net_cash_save = total_income - expenses;
    savings = savings * (1 + savingsMonthly) + net_cash_save;
    condo = condo * (1 + condoMonthly);
    const equity = condo - loan;
    const total_networth = savings + equity;

    rows.push({
      month: cur,
      total_income,
      income_breakdown,
      expenses,
      expense_breakdown,
      net_cash_save,
      saving_balance: savings,
      condo_value: condo,
      condo_loan: loan,
      equity,
      total_networth,
    });

    cur = nextMonth(cur);
  }
  return rows;
}

export function defaultMarriageConfig(): MarriageProjectionConfig {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return {
    kind: "marriage",
    start_month: `${year}-${month}`,
    months: 48,
    starting: {
      savings: 862114,
      condo_value: 2909000,
      condo_loan: 0,
    },
    growth: {
      savings_annual: 0.01,
      condo_annual: 0.03,
    },
    income_lines: [
      { label: "Transfer from Personal", monthly: 30000 },
      { label: "Transfer from Jane", monthly: 30000 },
      { label: "Rental", monthly: 0, schedule: [] },
      { label: "Other", monthly: 0 },
    ],
    expense_lines: [
      { label: "Mortgage", monthly: 0 },
      { label: "Utilities", monthly: 3500 },
      { label: "Household", monthly: 5000 },
      { label: "Joint dining", monthly: 4000 },
      { label: "Renovation", monthly: 0, schedule: [] },
      { label: "Misc", monthly: 2000 },
    ],
  };
}

export function isMarriageConfig(
  c: ProjectionConfig | MarriageProjectionConfig
): c is MarriageProjectionConfig {
  return (c as MarriageProjectionConfig).kind === "marriage";
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
