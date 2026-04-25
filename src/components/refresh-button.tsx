"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = {
  results: Array<{ name: string; ok: boolean; price?: number; error?: string }>;
  fx: number | null;
};

export function RefreshButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);

  function refresh() {
    startTransition(async () => {
      setSummary(null);
      const res = await fetch("/api/refresh-prices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        setSummary(`Error ${res.status}`);
        return;
      }
      const data: Result = await res.json();
      const ok = data.results.filter((r) => r.ok).length;
      const fail = data.results.length - ok;
      setSummary(`Updated ${ok}, failed ${fail}${data.fx ? `, FX ${data.fx.toFixed(2)}` : ""}`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={refresh}
        disabled={pending}
        className="px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? "Refreshing..." : "↻ Refresh prices"}
      </button>
      {summary && <span className="text-xs text-zinc-500">{summary}</span>}
    </div>
  );
}
