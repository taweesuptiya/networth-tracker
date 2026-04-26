"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BackfillButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [fromMonth, setFromMonth] = useState("2026-01");

  async function run() {
    setResult(null);
    setErrors([]);
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
      // Always log full response for debugging
      console.log("backfill response:", json);
      setErrors(json.errors ?? []);
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
      {errors.length > 0 && (
        <div className="basis-full mt-2 rounded border border-oxblood p-3 text-xs">
          <p className="font-medium mb-2">Per-asset errors ({errors.length}):</p>
          <ul className="space-y-1 font-mono text-[11px]">
            {errors.map((e, i) => (
              <li key={i} className="text-ink-subtle break-all">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result && errors.length === 0 && (
        <div className="basis-full mt-2 text-[10px] text-ink-faint">
          (Errors panel not appearing? Open DevTools console — full response is logged
          there. Or Vercel may not have redeployed yet — hard reload Ctrl+Shift+R.)
        </div>
      )}
    </div>
  );
}
