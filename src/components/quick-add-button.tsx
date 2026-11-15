"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitTransactions } from "@/app/actions/transactions";

export function QuickAddButton({
  workspaceId,
  currency = "THB",
}: {
  workspaceId: string;
  currency?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [txType, setTxType] = useState<string>("expense");
  const [category, setCategory] = useState("");

  function reset() {
    setDate(today);
    setDescription("");
    setAmount("");
    setDirection("debit");
    setTxType("expense");
    setCategory("");
    setError(null);
  }

  function handleDirectionChange(d: "debit" | "credit") {
    setDirection(d);
    setTxType(d === "debit" ? "expense" : "income");
  }

  function submit() {
    const amt = parseFloat(amount);
    if (!description.trim() || isNaN(amt) || amt <= 0) {
      setError("Fill in description and a valid amount.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await commitTransactions(workspaceId, [
        {
          occurred_at: date,
          description: description.trim(),
          amount: amt,
          currency,
          direction,
          tx_type: txType as "income" | "expense" | "transfer" | "cc_payment" | "reimbursement" | "asset_buy",
          category: category.trim() || null,
        },
      ]);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      {/* FAB on mobile / small inline button on desktop */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-oxblood text-white shadow-lg flex items-center justify-center text-2xl hover:opacity-90 md:static md:w-auto md:h-auto md:rounded-lg md:px-3 md:py-1.5 md:text-xs md:shadow-none"
        title="Quick-add transaction"
      >
        <span className="md:hidden">+</span>
        <span className="hidden md:inline text-xs">+ Quick add</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-paper w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Quick Add</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-ink-subtle text-xl leading-none w-8 h-8 flex items-center justify-center"
              >
                ×
              </button>
            </div>

            {/* Expense / Income toggle */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              <button
                onClick={() => handleDirectionChange("debit")}
                className={
                  "py-3 rounded-xl text-sm font-medium transition-colors " +
                  (direction === "debit"
                    ? "bg-oxblood text-white"
                    : "border border-paper-border text-ink-subtle")
                }
              >
                Expense
              </button>
              <button
                onClick={() => handleDirectionChange("credit")}
                className={
                  "py-3 rounded-xl text-sm font-medium transition-colors " +
                  (direction === "credit"
                    ? "bg-jade-bright text-white"
                    : "border border-paper-border text-ink-subtle")
                }
              >
                Income
              </button>
            </div>

            {/* Amount (large for mobile finger-friendliness) */}
            <div className="mb-4 text-center">
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full text-5xl text-center font-mono border-b-2 border-paper-border bg-transparent pb-2 focus:outline-none focus:border-oxblood placeholder:text-ink-faint"
                autoFocus
              />
              <p className="text-xs text-ink-faint mt-1">{currency}</p>
            </div>

            {/* Description */}
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Description"
              className="w-full mb-3 border border-paper-border rounded-lg px-3 py-2.5 bg-transparent text-sm"
            />

            {/* Date + Category */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border border-paper-border rounded-lg px-3 py-2.5 bg-transparent text-sm"
              />
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category (opt.)"
                className="border border-paper-border rounded-lg px-3 py-2.5 bg-transparent text-sm"
              />
            </div>

            {error && <p className="text-xs text-oxblood-bright mb-3">{error}</p>}

            <button
              onClick={submit}
              disabled={pending}
              className="w-full py-3 rounded-xl bg-oxblood text-white font-medium text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {pending ? "Adding…" : "Add Transaction"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
