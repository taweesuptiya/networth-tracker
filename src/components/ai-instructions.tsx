"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAiInstructions } from "@/app/actions/accounts";
import { DEFAULT_AI_INSTRUCTIONS } from "@/lib/default-ai-instructions";

const CATEGORIES = [
  "Food & Dining",
  "Coffee",
  "Transport",
  "Groceries",
  "Healthcare",
  "Utilities",
  "Subscriptions",
  "Shopping",
  "Travel",
  "Health & Fitness",
  "Insurance",
  "Education",
  "Personal Care",
  "Salary",
  "Bonus",
  "Freelance Income",
  "Interest",
  "Cashback",
  "Reimbursement",
  "Other",
];

/** Append a merchant rule into the correct section of the instructions text */
function appendMerchantRule(text: string, merchant: string, category: string): string {
  const line = `- ${merchant} → "${category}"`;

  // Try to find the matching category section header and insert after its last bullet
  // Look for a section that contains this category name (case-insensitive)
  const sectionPatterns: Record<string, RegExp> = {
    "Food & Dining": /^Food & Dining.*:/im,
    "Coffee": /^Coffee shops.*:/im,
    "Transport": /^Transport.*:/im,
    "Groceries": /^Groceries.*:/im,
    "Healthcare": /^Healthcare.*:/im,
    "Utilities": /^Utilities.*:/im,
    "Subscriptions": /^Subscriptions.*:/im,
    "Shopping": /^Shopping.*:/im,
    "Travel": /^Travel.*:/im,
    "Health & Fitness": /^Health & Fitness.*:/im,
    "Insurance": /^Insurance.*:/im,
    "Education": /^Education.*:/im,
    "Personal Care": /^Personal Care.*:/im,
  };

  const pattern = sectionPatterns[category];
  if (pattern) {
    const match = pattern.exec(text);
    if (match) {
      // Find the end of this section (next blank line or next section header)
      const afterHeader = text.slice(match.index + match[0].length);
      // Find the last bullet in this section
      const sectionEnd = afterHeader.search(/^\n\n|\n[A-Z]/m);
      const sectionContent = sectionEnd === -1 ? afterHeader : afterHeader.slice(0, sectionEnd);
      const insertAt = match.index + match[0].length + sectionContent.length;
      return text.slice(0, insertAt) + "\n" + line + text.slice(insertAt);
    }
  }

  // Income categories — insert after INCOME section header block
  const incomeCategories = ["Salary", "Bonus", "Freelance Income", "Interest", "Cashback", "Reimbursement"];
  if (incomeCategories.includes(category)) {
    const incomeMatch = /^INCOME.*:/im.exec(text);
    if (incomeMatch) {
      const afterHeader = text.slice(incomeMatch.index + incomeMatch[0].length);
      const sectionEnd = afterHeader.search(/^\n\n[A-Z]|\nEXPENSES/m);
      const sectionContent = sectionEnd === -1 ? afterHeader : afterHeader.slice(0, sectionEnd);
      const insertAt = incomeMatch.index + incomeMatch[0].length + sectionContent.length;
      return text.slice(0, insertAt) + "\n" + line + text.slice(insertAt);
    }
  }

  // Fallback: append before TRANSFERS section or at very end
  const transferMatch = /^TRANSFERS.*:/im.exec(text);
  if (transferMatch) {
    return text.slice(0, transferMatch.index) + line + "\n\n" + text.slice(transferMatch.index);
  }
  return text + "\n" + line;
}

export function AiInstructionsManager({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial || DEFAULT_AI_INSTRUCTIONS);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Quick-add state
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  function onSave() {
    setSaved(false);
    startTransition(async () => {
      const res = await saveAiInstructions(workspaceId, text);
      if (!res.error) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  function onRestoreDefault() {
    setText(DEFAULT_AI_INSTRUCTIONS);
    setSaved(false);
  }

  function onQuickAdd() {
    const m = merchant.trim();
    if (!m) return;
    const newText = appendMerchantRule(text, m, category);
    setText(newText);
    setSaved(false);
    setJustAdded(`"${m}" → ${category}`);
    setMerchant("");
    setTimeout(() => setJustAdded(null), 3000);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-1">
        ✨ AI categorization instructions
      </h2>
      <p className="text-xs text-zinc-500 mb-4">
        Plain-English rules the AI follows when assigning categories. Use Quick Add to map new merchants without editing the textarea.
      </p>

      {/* Quick Add */}
      <div className="mb-4 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 space-y-2">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Quick add merchant</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onQuickAdd(); } }}
            placeholder="e.g. Savoey, iHerb, True Wallet"
            className="flex-1 min-w-44 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={onQuickAdd}
            disabled={!merchant.trim()}
            className="px-3 py-1.5 text-xs rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-40"
          >
            Add rule
          </button>
        </div>
        {justAdded && (
          <p className="text-xs text-green-600 dark:text-green-400">
            ✓ Added {justAdded} — click Save below to apply
          </p>
        )}
      </div>

      {/* Full textarea */}
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={22}
        className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-xs font-mono"
      />
      <div className="flex justify-between items-center mt-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {text.length} chars — sent to AI on every scan
          </span>
          <button
            onClick={onRestoreDefault}
            className="text-xs text-zinc-400 hover:text-zinc-600 underline underline-offset-2"
          >
            Restore default
          </button>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-600">Saved ✓</span>}
          <button
            onClick={onSave}
            disabled={pending}
            className="px-3 py-1.5 text-xs rounded bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save instructions"}
          </button>
        </div>
      </div>
    </div>
  );
}
