"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/review", label: "Monthly review" },
  { href: "/projection", label: "Projection" },
  { href: "/transactions", label: "Transactions" },
  { href: "/statements", label: "Upload" },
  { href: "/accounts", label: "Accounts & rules" },
];

export function Sidebar({
  userEmail,
  isOpen = false,
  onClose,
}: {
  userEmail: string | null;
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const ws = params.get("ws");
  const wsQuery = ws ? `?ws=${ws}` : "";

  return (
    <aside
      className={
        "fixed inset-y-0 left-0 z-40 w-72 shrink-0 flex flex-col bg-paper py-4 px-3 " +
        "transition-transform duration-300 ease-in-out " +
        (isOpen ? "translate-x-0" : "-translate-x-full") +
        " md:relative md:w-64 md:translate-x-0 md:z-auto"
      }
    >
      <div className="card-surface rounded-2xl p-5 mb-3">
        <div className="flex items-start justify-between">
          <Link href={`/${wsQuery}`} className="block" onClick={onClose}>
            <div className="display text-2xl leading-none">Ledger</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink-faint mt-2">
              Net worth · Spend
            </div>
          </Link>
          <button
            className="md:hidden text-ink-faint hover:text-ink p-1 -mr-1 mt-0.5 shrink-0"
            onClick={onClose}
            aria-label="Close menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {userEmail && (
          <div className="mt-4 text-[11px] text-ink-faint truncate font-mono" title={userEmail}>
            {userEmail}
          </div>
        )}
      </div>

      <nav className="card-surface rounded-2xl flex-1 p-2 flex flex-col">
        <div className="flex-1">
          {items.map((item, idx) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={`${item.href}${wsQuery}`}
                onClick={onClose}
                className={
                  "group flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl transition-colors mb-1 " +
                  (active
                    ? "bg-ink text-white"
                    : "text-ink-subtle hover:text-ink hover:bg-paper-darker")
                }
              >
                <span
                  className={
                    "font-mono text-[10px] tabular-nums w-6 " +
                    (active ? "text-white/60" : "text-ink-faint")
                  }
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="font-medium">{item.label}</span>
                {active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/80" />
                )}
              </Link>
            );
          })}
        </div>

        <form action="/auth/signout" method="post" className="px-3 py-3 border-t mx-1 mt-2">
          <button className="text-[11px] uppercase tracking-[0.18em] text-ink-faint hover:text-ink">
            Sign out
          </button>
        </form>
      </nav>
    </aside>
  );
}
