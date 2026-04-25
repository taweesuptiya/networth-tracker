"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Workspace = { id: string; name: string };

export function WorkspaceSwitcher({
  workspaces,
  activeId,
}: {
  workspaces: Workspace[];
  activeId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
      {workspaces.map((w) => {
        const isActive = w.id === activeId;
        return (
          <button
            key={w.id}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("ws", w.id);
              router.push(`/?${next.toString()}`);
            }}
            className={
              "px-3 py-1 text-xs rounded-md transition-colors " +
              (isActive
                ? "bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100")
            }
          >
            {w.name}
          </button>
        );
      })}
    </div>
  );
}
