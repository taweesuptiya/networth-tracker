"use client";

import { useState, useTransition } from "react";
import { saveAiInstructions } from "@/app/actions/accounts";
import { DEFAULT_AI_INSTRUCTIONS } from "@/lib/default-ai-instructions";

export function AiInstructionsManager({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: string;
}) {
  const [text, setText] = useState(initial || DEFAULT_AI_INSTRUCTIONS);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function onSave() {
    setSaved(false);
    startTransition(async () => {
      const res = await saveAiInstructions(workspaceId, text);
      if (!res.error) setSaved(true);
    });
  }

  function onRestoreDefault() {
    setText(DEFAULT_AI_INSTRUCTIONS);
    setSaved(false);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 mb-6">
      <h2 className="text-sm font-medium text-zinc-500 mb-2">
        ✨ AI categorization instructions
      </h2>
      <p className="text-xs text-zinc-500 mb-3">
        Plain-English rules the AI follows when scanning statements and assigning
        categories. Edit to match your own spending habits.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={18}
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
