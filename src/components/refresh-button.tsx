"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type RefreshResult = {
  results: Array<{ name: string; ok: boolean; price?: number; error?: string }>;
  fx: number | null;
};

export function RefreshButton({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<RefreshResult | null>(null);
  const [open, setOpen] = useState(false);

  function refresh() {
    startTransition(async () => {
      setData(null);
      const res = await fetch("/api/refresh-prices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        setData({ results: [{ name: `HTTP ${res.status}`, ok: false, error: await res.text() }], fx: null });
        setOpen(true);
        return;
      }
      const json: RefreshResult = await res.json();
      setData(json);
      setOpen(true);
      router.refresh();
    });
  }

  const ok = data ? data.results.filter((r) => r.ok).length : 0;
  const fail = data ? data.results.length - ok : 0;

  return (
    <div className="relative">
      <button
        onClick={refresh}
        disabled={pending}
        className="px-3 py-1.5 text-xs rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? "Refreshing..." : "↻ Refresh prices"}
      </button>
      {data && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {ok} ok / {fail} failed {data.fx ? `· FX ${data.fx.toFixed(2)}` : ""}
        </button>
      )}
      {open && data && (
        <div className="absolute right-0 mt-2 w-96 max-h-80 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-3 z-50 text-xs">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">Refresh details</span>
            <button onClick={() => setOpen(false)} className="text-zinc-500">✕</button>
          </div>
          <ul className="space-y-1.5">
            {data.results.map((r, i) => (
              <li key={i} className="flex flex-col">
                <div className="flex justify-between gap-2">
                  <span className={r.ok ? "text-green-600" : "text-red-500"}>
                    {r.ok ? "✓" : "✗"} {r.name}
                  </span>
                  {r.ok && <span>{r.price?.toFixed(4)}</span>}
                </div>
                {r.error && (
                  <span className="text-zinc-500 break-all pl-4">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
