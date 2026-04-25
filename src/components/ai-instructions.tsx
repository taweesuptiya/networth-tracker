"use client";

import { useState, useTransition } from "react";
import { saveAiInstructions } from "@/app/actions/accounts";

export function AiInstructionsManager({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: string;
}) {
  const [text, setText] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function onSave() {
    setSaved(false);
    startTransition(async () => {
      const res = await saveAiInstructions(workspaceId, text);
      if (!res.error) setSaved(true);
    });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-2">
        ✨ AI categorization instructions
      </h2>
      <p className="text-xs text-zinc-500 mb-3">
        Plain-English notes the AI follows when assigning categories. Useful for
        habits the LLM can&apos;t infer from descriptions alone.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder={
          "Examples:\n" +
          "- 'Grab Taxi Co.,Ltd.' is my salary employer; categorize KBANK PAYROLL transfers as 'Salary'.\n" +
          "- Anything from 'Anonphat' is a friend split — category 'Grab Food + Transport'.\n" +
          "- 'AGODA' both as expense (travel booking) and credit (refund) maps to 'Travel'.\n" +
          "- Treat 'iHerb' and 'TG FOOD PRODUCTS' as 'Household items'.\n" +
          "- Put 'Apple', 'Netflix', 'Disney', 'Spotify', 'Claude.ai' under 'Monthly Subscription'."
        }
        rows={10}
        className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-xs font-mono"
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-zinc-500">
          {text.length} chars — sent to AI on every category suggestion
        </span>
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
