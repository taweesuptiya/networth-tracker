"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitTransactions, type CommitTx } from "@/app/actions/transactions";
import { classify, type Rule, type ParsedTx, type ClassifiedTx } from "@/lib/tx-rules";

type ParseResult = {
  period: { start: string; end: string };
  currency: string;
  account_holder: string | null;
  account_number: string | null;
  transactions: ParsedTx[];
};

type SavedPassword = { id: string; label: string | null; password: string };

type Account = {
  id: string;
  name: string;
  type: "savings" | "credit_card" | "cash";
};

const TX_TYPES = [
  "income",
  "expense",
  "transfer",
  "cc_payment",
  "cc_payment_received",
  "reimbursement",
] as const;

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

export function StatementUploader({
  workspaces,
  savedPasswords,
  accounts,
  rules,
}: {
  workspaces: { id: string; name: string }[];
  savedPasswords: SavedPassword[];
  accounts: Account[];
  rules: Rule[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [parsing, setParsing] = useState(false);
  const [committing, startCommit] = useTransition();
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [classified, setClassified] = useState<ClassifiedTx[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);
  const [progress, setProgress] = useState<string>("");

  const selectedAccount = accounts.find((a) => a.id === accountId);

  async function onParse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setParsed(null);
    setClassified([]);
    setCommitted(null);
    if (!file) return;
    if (!selectedAccount) {
      setError("Please select an account first (or add one in Accounts & rules).");
      return;
    }
    setParsing(true);
    setProgress("Reading PDF...");

    try {
      const buf = await file.arrayBuffer();
      const fd = new FormData();
      const encrypted = await pdfHeaderHasEncrypt(buf);
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
        fd.append("text", result.text);
      } else {
        fd.append("file", file);
      }

      setProgress("Sending to Claude for parsing...");
      const res = await fetch("/api/statements/parse", { method: "POST", body: fd });
      const text = await res.text();
      if (!res.ok) {
        setError(`HTTP ${res.status}: ${text.slice(0, 500) || "(empty)"}`);
        return;
      }
      const json: ParseResult = JSON.parse(text);
      setParsed(json);

      // Apply rules client-side based on selected account type
      const cls = classify(json.transactions, rules, selectedAccount.type);
      setClassified(cls);
      setSelected(new Set(cls.map((_, i) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
      setProgress("");
    }
  }

  function toggle(i: number) {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  }

  function updateTx(i: number, patch: Partial<ClassifiedTx>) {
    const next = [...classified];
    next[i] = { ...next[i], ...patch };
    setClassified(next);
  }

  function onCommit() {
    if (!parsed || !workspaceId || !selectedAccount) return;
    const txs: CommitTx[] = classified
      .filter((_, i) => selected.has(i))
      .map((t) => ({
        occurred_at: t.date,
        description: t.description,
        amount: t.amount,
        currency: t.currency,
        direction: t.direction,
        category: t.category ?? null,
        tx_type: t.tx_type,
        account_id: selectedAccount.id,
      }));
    if (txs.length === 0) return;
    startCommit(async () => {
      const res = await commitTransactions(workspaceId, txs);
      if (res.error) setError(res.error);
      else {
        setCommitted(res.count);
        setParsed(null);
        setClassified([]);
        setFile(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-3">Upload PDF statement</h2>
      {accounts.length === 0 && (
        <p className="text-xs text-amber-600 mb-3">
          ⚠️ Add at least one account in the Accounts & rules page before uploading.
        </p>
      )}
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
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-2 py-1.5 text-sm"
        >
          {accounts.length === 0 ? (
            <option value="">— no accounts —</option>
          ) : (
            accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))
          )}
        </select>
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
        <button
          type="submit"
          disabled={!file || parsing || accounts.length === 0}
          className="px-3 py-1.5 text-sm rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
        >
          {parsing ? progress || "Working..." : "Parse statement"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-500 break-all">{error}</p>}
      {committed != null && (
        <p className="mt-3 text-sm text-green-600">Saved {committed} transactions ✓</p>
      )}

      {parsed && classified.length > 0 && (
        <div className="mt-6">
          <div className="flex justify-between items-center mb-3 text-xs text-zinc-500">
            <span>
              Period: {parsed.period.start} → {parsed.period.end} · Currency: {parsed.currency}
              {parsed.account_number ? ` · Account ${parsed.account_number}` : ""}
            </span>
            <span>
              {selected.size} of {classified.length} selected
            </span>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden mb-3 max-h-[28rem] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {classified.map((t, i) => (
                  <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggle(i)}
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.date}</td>
                    <td className="px-3 py-2 max-w-64 truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={t.tx_type}
                        onChange={(e) =>
                          updateTx(i, { tx_type: e.target.value as ClassifiedTx["tx_type"] })
                        }
                        className={
                          "rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 py-0.5 " +
                          (t.matched_rule_id ? "" : "text-amber-600")
                        }
                        title={t.matched_rule_id ? "Set by rule" : "Default — no rule matched"}
                      >
                        {TX_TYPES.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={t.category ?? ""}
                        onChange={(e) => updateTx(i, { category: e.target.value })}
                        className="w-32 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 py-0.5"
                      />
                    </td>
                    <td
                      className={`px-3 py-2 text-right whitespace-nowrap ${
                        t.direction === "credit" ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {t.direction === "credit" ? "+" : "−"}
                      {t.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} {t.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onCommit}
              disabled={committing || selected.size === 0}
              className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white disabled:opacity-50"
            >
              {committing
                ? "Saving..."
                : `Save ${selected.size} transactions to ${
                    workspaces.find((w) => w.id === workspaceId)?.name
                  }`}
            </button>
            <span className="text-xs text-zinc-500">
              Amber type = no rule matched (please review)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
