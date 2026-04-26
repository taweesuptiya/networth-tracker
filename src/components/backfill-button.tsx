"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BackfillButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [fromMonth, setFromMonth] = useState("2026-01");

  async function run() {
    setResult(null);
    setRunning(true);
    try {
      const res = await fetch("/api/backfill-snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, from_month: fromMonth }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult(`Error: ${json.error ?? res.status}`);
        return;
      }
      setResult(
        `✓ Processed ${json.assets_processed} assets · wrote ${json.snapshots_written} snapshots${
          json.errors?.length ? ` · ${json.errors.length} errors` : ""
        }`
      );
      router.refresh();
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-ink-subtle">From</span>
      <input
        type="month"
        value={fromMonth}
        onChange={(e) => setFromMonth(e.target.value)}
        className="rounded border bg-transparent px-2 py-1 font-mono"
      />
      <button
        onClick={run}
        disabled={running}
        className="px-3 py-1.5 rounded border border-oxblood text-oxblood hover:bg-paper-darker disabled:opacity-50"
      >
        {running ? "Backfilling..." : "↻ Backfill investment history"}
      </button>
      {result && <span className="text-ink-subtle">{result}</span>}
    </div>
  );
}
