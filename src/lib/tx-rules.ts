// Rule engine: apply classification rules to a list of parsed transactions.

export type Rule = {
  id: string;
  priority: number;
  pattern: string;
  match_type: "contains" | "regex";
  applies_to_account_type: "all" | "savings" | "credit_card" | "cash";
  applies_to_direction: "all" | "credit" | "debit";
  set_tx_type: "income" | "expense" | "transfer" | "transfer_in" | "asset_buy" | "cc_payment" | "cc_payment_received" | "reimbursement";
  set_category: string | null;
  enabled: boolean;
  min_amount?: number | null;
  max_amount?: number | null;
};

export type ParsedTx = {
  date: string;
  description: string;
  amount: number;
  currency: string;
  direction: "credit" | "debit";
  category?: string;
};

export type ClassifiedTx = ParsedTx & {
  tx_type:
    | "income"
    | "expense"
    | "transfer"
    | "transfer_in"
    | "asset_buy"
    | "cc_payment"
    | "cc_payment_received"
    | "reimbursement";
  matched_rule_id: string | null;
};

function matches(rule: Rule, tx: ParsedTx, accountType: "savings" | "credit_card" | "cash"): boolean {
  if (!rule.enabled) return false;
  if (rule.applies_to_account_type !== "all" && rule.applies_to_account_type !== accountType) return false;
  if (rule.applies_to_direction !== "all" && rule.applies_to_direction !== tx.direction) return false;
  const amt = Number(tx.amount);
  if (rule.min_amount != null && amt < Number(rule.min_amount)) return false;
  if (rule.max_amount != null && amt > Number(rule.max_amount)) return false;
  const desc = tx.description ?? "";
  if (rule.match_type === "regex") {
    try {
      return new RegExp(rule.pattern, "i").test(desc);
    } catch {
      return false;
    }
  }
  return desc.toLowerCase().includes(rule.pattern.toLowerCase());
}

export function classify(
  txs: ParsedTx[],
  rules: Rule[],
  accountType: "savings" | "credit_card" | "cash"
): ClassifiedTx[] {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  return txs.map((tx) => {
    for (const rule of sorted) {
      if (matches(rule, tx, accountType)) {
        return {
          ...tx,
          tx_type: rule.set_tx_type,
          category: rule.set_category ?? tx.category,
          matched_rule_id: rule.id,
        };
      }
    }
    // Default fallback
    const defaultType = accountType === "credit_card" && tx.direction === "credit"
      ? "cc_payment_received"
      : tx.direction === "credit"
        ? "income"
        : "expense";
    return {
      ...tx,
      tx_type: defaultType as ClassifiedTx["tx_type"],
      matched_rule_id: null,
    };
  });
}

// Default rules seeded based on user's KBANK + UOB CC patterns.
export const defaultRules: Omit<Rule, "id" | "enabled">[] = [
  {
    priority: 10,
    pattern: "KBANK PAYROLL",
    match_type: "contains",
    applies_to_account_type: "savings",
    applies_to_direction: "credit",
    set_tx_type: "income",
    set_category: "Salary",
  },
  {
    priority: 11,
    pattern: "Concur",
    match_type: "contains",
    applies_to_account_type: "savings",
    applies_to_direction: "credit",
    set_tx_type: "reimbursement",
    set_category: "Travel",
  },
  {
    priority: 12,
    pattern: "AGODA",
    match_type: "contains",
    applies_to_account_type: "savings",
    applies_to_direction: "credit",
    set_tx_type: "reimbursement",
    set_category: "Travel",
  },
  {
    priority: 20,
    pattern: "TIYAWONGM|TAWEESUP TIYAW",
    match_type: "regex",
    applies_to_account_type: "savings",
    applies_to_direction: "all",
    set_tx_type: "transfer",
    set_category: null,
  },
  {
    priority: 30,
    pattern: "KRUNGTHAI CARD",
    match_type: "contains",
    applies_to_account_type: "savings",
    applies_to_direction: "debit",
    set_tx_type: "cc_payment",
    set_category: "KTC card",
  },
  {
    priority: 40,
    pattern: "TRUE MONEY",
    match_type: "contains",
    applies_to_account_type: "savings",
    applies_to_direction: "debit",
    set_tx_type: "expense",
    set_category: "Bills",
  },
  {
    priority: 50,
    pattern: "SMART BAY|REGISTRAR",
    match_type: "regex",
    applies_to_account_type: "savings",
    applies_to_direction: "credit",
    set_tx_type: "income",
    set_category: "Interest/Dividend",
  },
  {
    priority: 60,
    // Friend transfers in (split-bill reimbursements). Catch any "From X#### MR./MS./MRS./MASTER ..."
    // that reaches our generic friend pattern.
    pattern: "^From [A-Z0-9]+ M[RS]?S?\\.?",
    match_type: "regex",
    applies_to_account_type: "savings",
    applies_to_direction: "credit",
    set_tx_type: "reimbursement",
    set_category: "Dining",
  },
  {
    priority: 100,
    pattern: "PAYMENT THANK YOU",
    match_type: "contains",
    applies_to_account_type: "credit_card",
    applies_to_direction: "credit",
    set_tx_type: "cc_payment_received",
    set_category: null,
  },
  {
    priority: 110,
    pattern: "NETFLIX|Disney|Spotify|APPLE\\.COM|Kindle|CLAUDE\\.AI",
    match_type: "regex",
    applies_to_account_type: "credit_card",
    applies_to_direction: "debit",
    set_tx_type: "expense",
    set_category: "Subscriptions",
  },
  {
    priority: 120,
    pattern: "AGODA",
    match_type: "contains",
    applies_to_account_type: "credit_card",
    applies_to_direction: "debit",
    set_tx_type: "expense",
    set_category: "Travel",
  },
];

// Apply reimbursements: subtract reimbursement amounts from the matching category's expense total.
export type MonthlyTotals = {
  month: string;
  income: number;
  expense_by_category: Map<string, number>; // net (gross - reimbursement)
  gross_expense_by_category: Map<string, number>;
  reimbursement_by_category: Map<string, number>;
  expense: number; // net of reimbursements
  income_excl_reimb: number;
};

type StoredTx = {
  occurred_at: string;
  amount: number;
  direction: "credit" | "debit";
  tx_type: string;
  category: string | null;
};

export function aggregateMonthly(txs: StoredTx[]): MonthlyTotals[] {
  const byMonth = new Map<string, MonthlyTotals>();
  for (const t of txs) {
    const month = String(t.occurred_at).slice(0, 7);
    let row = byMonth.get(month);
    if (!row) {
      row = {
        month,
        income: 0,
        expense_by_category: new Map(),
        gross_expense_by_category: new Map(),
        reimbursement_by_category: new Map(),
        expense: 0,
        income_excl_reimb: 0,
      };
      byMonth.set(month, row);
    }
    const amt = Number(t.amount);
    const cat = t.category || "Uncategorized";
    const addNet = (delta: number) =>
      row!.expense_by_category.set(cat, (row!.expense_by_category.get(cat) ?? 0) + delta);
    switch (t.tx_type) {
      case "income":
        row.income += amt;
        row.income_excl_reimb += amt;
        break;
      case "transfer_in":
        // Paired credit on a Marriage workspace from Personal (or vice versa).
        // Counts as income for the receiving workspace's P&L.
        row.income += amt;
        row.income_excl_reimb += amt;
        break;
      case "expense":
        row.gross_expense_by_category.set(
          cat,
          (row.gross_expense_by_category.get(cat) ?? 0) + amt
        );
        addNet(amt);
        break;
      case "reimbursement":
        row.reimbursement_by_category.set(
          cat,
          (row.reimbursement_by_category.get(cat) ?? 0) + amt
        );
        addNet(-amt);
        break;
      case "transfer":
      case "asset_buy":
      case "cc_payment":
      case "cc_payment_received":
        // Excluded from P&L (transfer = outgoing money to another bucket;
        // asset_buy = reallocation between cash and investment)
        break;
      default:
        if (t.direction === "credit") {
          row.income += amt;
          row.income_excl_reimb += amt;
        } else {
          row.gross_expense_by_category.set(
            cat,
            (row.gross_expense_by_category.get(cat) ?? 0) + amt
          );
          addNet(amt);
        }
    }
  }
  for (const row of byMonth.values()) {
    row.expense = Array.from(row.expense_by_category.values()).reduce((s, v) => s + v, 0);
  }
  return Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
}
