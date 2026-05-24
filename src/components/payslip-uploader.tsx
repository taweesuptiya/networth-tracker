"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitTransactions, checkForDuplicates, type CommitTx } from "@/app/actions/transactions";

type ItemType =
  | "net_pay"
  | "pf_employee"
  | "ss_employee"
  | "withholding_tax"
  | "allowance"
  | "other_deduction"
  | "other_income";

type LineItem = {
  description: string;
  amount: number;
  direction: "credit" | "debit";
  item_type: ItemType;
};

type ParsedPayslip = {
  pay_date: string;
  period?: string;
  employee_name?: string | null;
  currency: string;
  line_items: LineItem[];
};

type Account = { id: string; name: string; type: string };
type AssetRef = { id: string; name: string; type: string };
type WorkspaceRef = { id: string; name: string };
type SavedPassword = { id: string; label: string | null; password: string };

const ITEM_LABEL: Record<ItemType, string> = {
  net_pay: "Net Pay",
  pf_employee: "Provident Fund",
  ss_employee: "Social Security",
  withholding_tax: "Withholding Tax",
  allowance: "Allowance",
  other_income: "Income",
  other_deduction: "Deduction",
};

const TX_TYPE_FOR: Record<ItemType, string> = {
  net_pay: "income",
  pf_employee: "asset_buy",
  ss_employee: "expense",
  withholding_tax: "expense",
  allowance: "income",
  other_income: "income",
  other_deduction: "expense",
};

const CATEGORY_FOR: Record<ItemType, string | null> = {
  net_pay: "Salary",
  pf_employee: null,
  ss_employee: "Social Security",
  withholding_tax: "Income Tax",
  allowance: "Allowance",
  other_income: null,
  other_deduction: null,
};

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  return pdfjs;
}

async function pdfHeaderHasEncrypt(buf: ArrayBuffer): Promise<boolean> {
  const tail = new Uint8Array(buf, Math.max(0, buf.byteLength - 8192));
  const needle = new TextEncoder().encode("/Encrypt");
  outer: for (let i = 0; i <= tail.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (tail[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

async function extractText(
  buf: ArrayBuffer,
  passwords: string[]
): Promise<{ text: string } | { error: string }> {
  const pdfjs = await loadPdfjs();
  const candidates: (string | undefined)[] = [undefined, ...passwords];
  let lastErr = "";
  for (const pw of candidates) {
    try {
      const data = new Uint8Array(buf.slice(0));
      const doc = await pdfjs.getDocument({ data, password: pw }).promise;
      let out = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const c = await page.getTextContent();
        out +=
          `\n--- Page ${i} ---\n` +
          c.items.map((item) => ("str" in item ? item.str : "")).join(" ") +
          "\n";
      }
      return { text: out };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (!/password/i.test(lastErr)) return { error: lastErr };
    }
  }
  return { error: `Decryption failed. Last error: ${lastErr}` };
}

export function PayslipUploader({
  workspaces,
  savedPasswords,
  accounts,
  assets,
}: {
  workspaces: WorkspaceRef[];
  savedPasswords: SavedPassword[];
  accounts: Account[];
  assets: AssetRef[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [workspaceId, setWorkspaceId] = useState(
    workspaces.find((w) => w.name.toLowerCase() === "personal")?.id ?? workspaces[0]?.id ?? ""
  );
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [pfAssetId, setPfAssetId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [committing, startCommit] = useTransition();
  const [parsed, setParsed] = useState<ParsedPayslip | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dupes, setDupes] = useState<boolean[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);
  const [progress, setProgress] = useState("");

  const hasPf = parsed?.line_items.some((li) => li.item_type === "pf_employee") ?? false;
  const pfAssets = assets.filter((a) => ["Fund", "Stock", "Crypto"].includes(a.type));

  async function onParse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setParsed(null);
    setCommitted(null);
    if (!file) return;
    setParsing(true);
    setProgress("Reading PDF...");

    try {
      const buf = await file.arrayBuffer();
      const encrypted = await pdfHeaderHasEncrypt(buf);
      let text: string;

      if (encrypted) {
        setProgress(`Decrypting with ${savedPasswords.length} saved password(s)...`);
        const result = await extractText(buf, savedPasswords.map((p) => p.password));
        if ("error" in result) {
          setError(
            savedPasswords.length === 0
              ? "PDF is password-protected but you haven't saved any passwords yet."
              : `Could not decrypt: ${result.error}`
          );
          return;
        }
        text = result.text;
      } else {
        const result = await extractText(buf, []);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        text = result.text;
      }

      setProgress("Parsing payslip with Claude...");
      const fd = new FormData();
      fd.append("text", text);
      const res = await fetch("/api/payslips/parse", { method: "POST", body: fd });
      const raw = await res.text();
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${raw.slice(0, 500)}`);
        return;
      }
      const payslip: ParsedPayslip = JSON.parse(raw);
      setParsed(payslip);

      setProgress("Checking for duplicates...");
      const dupFlags = await checkForDuplicates(
        workspaceId,
        payslip.line_items.map((li) => ({
          occurred_at: payslip.pay_date,
          amount: li.amount,
          direction: li.direction,
          description: li.description,
        }))
      );
      setDupes(dupFlags);
      setSelected(new Set(payslip.line_items.map((_, i) => i).filter((i) => !dupFlags[i])));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
      setProgress("");
    }
  }

  function onCommit() {
    if (!parsed || !workspaceId) return;
    startCommit(async () => {
      const txs: CommitTx[] = parsed.line_items
        .map((li, i) => ({ li, i }))
        .filter(({ i }) => selected.has(i))
        .map(({ li }) => {
          const isPf = li.item_type === "pf_employee";
          const hasAsset = isPf && !!pfAssetId;
          return {
            occurred_at: parsed.pay_date,
            description: li.description,
            amount: li.amount,
            currency: parsed.currency,
            direction: li.direction,
            // If PF but no asset chosen, fall back to expense so it still records
            tx_type: (!hasAsset && isPf ? "expense" : TX_TYPE_FOR[li.item_type]) as CommitTx["tx_type"],
            category: CATEGORY_FOR[li.item_type],
            account_id: accountId || null,
            target_asset_id: hasAsset ? pfAssetId : null,
            units_delta: null,
          };
        });

      if (txs.length === 0) return;
      const res = await commitTransactions(workspaceId, txs);
      if (res.error) setError(res.error);
      else {
        setCommitted(res.count);
        setParsed(null);
        setSelected(new Set());
        setDupes([]);
        setFile(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-3">Upload payslip</h2>
      <form onSubmit={onParse} className="flex flex-wrap items-center gap-3">
        <label className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
          {file ? "Change file" : "Choose PDF"}
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
        </label>
        {file && (
          <span className="text-xs text-zinc-500 truncate max-w-48" title={file.name}>
            {file.name}
          </span>
        )}
        <select
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5 text-sm"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5 text-sm"
        >
          <option value="">— no account —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.type})
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!file || parsing}
          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
        >
          {parsing ? progress || "Working..." : "Parse payslip"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-500 break-all">{error}</p>}
      {committed != null && (
        <p className="mt-3 text-sm text-green-600">
          Saved {committed} transaction{committed === 1 ? "" : "s"} ✓
        </p>
      )}

      {parsed && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-3 text-xs text-zinc-500">
            <span>
              {parsed.employee_name ? `${parsed.employee_name} · ` : ""}
              Pay date: {parsed.pay_date}
              {parsed.period ? ` (${parsed.period})` : ""}
              {dupes.filter(Boolean).length > 0 && (
                <span className="ml-3 text-oxblood">
                  · {dupes.filter(Boolean).length} duplicate
                  {dupes.filter(Boolean).length === 1 ? "" : "s"} detected
                </span>
              )}
            </span>
            <span>
              {selected.size} of {parsed.line_items.length} selected
            </span>
          </div>

          {hasPf && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3 mb-3 text-xs">
              <p className="font-medium mb-1">Provident Fund detected — assign to asset</p>
              <select
                value={pfAssetId}
                onChange={(e) => setPfAssetId(e.target.value)}
                className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1"
              >
                <option value="">— pick PF asset (or save as expense) —</option>
                {pfAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
              {!pfAssetId && (
                <p className="mt-1 text-amber-700 dark:text-amber-400">
                  No asset selected — PF will be saved as a plain expense.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-3">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
                <tr>
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={
                        parsed.line_items.length > 0 &&
                        parsed.line_items.every((_, i) => selected.has(i))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelected(new Set(parsed.line_items.map((_, i) => i)));
                        } else {
                          setSelected(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {parsed.line_items.map((li, i) => {
                  const isDup = dupes[i];
                  return (
                    <tr
                      key={i}
                      className={
                        "border-t border-zinc-200 dark:border-zinc-800 " +
                        (isDup ? "opacity-50" : "")
                      }
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => {
                            const next = new Set(selected);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {isDup && (
                          <span className="mr-2 text-[10px] uppercase tracking-wider text-oxblood">
                            ↻ dup
                          </span>
                        )}
                        {li.description}
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {ITEM_LABEL[li.item_type]}
                        {li.item_type === "pf_employee" && pfAssetId && (
                          <span className="ml-1 text-amber-600">→ asset</span>
                        )}
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right font-mono " +
                          (li.direction === "credit" ? "text-green-600" : "text-red-500")
                        }
                      >
                        {li.direction === "credit" ? "+" : "−"}
                        {li.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}{" "}
                        {parsed.currency}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            onClick={onCommit}
            disabled={committing || selected.size === 0}
            className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white disabled:opacity-50"
          >
            {committing
              ? "Saving..."
              : `Save ${selected.size} item${selected.size === 1 ? "" : "s"} to ${
                  workspaces.find((w) => w.id === workspaceId)?.name
                }`}
          </button>
        </div>
      )}
    </div>
  );
}
