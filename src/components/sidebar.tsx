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

export function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const ws = params.get("ws");
  const wsQuery = ws ? `?ws=${ws}` : "";

  return (
    <aside className="w-60 shrink-0 border-r flex flex-col">
      <div className="px-6 pt-8 pb-6">
        <Link href={`/${wsQuery}`} className="block">
          <div className="display text-3xl leading-none">Ledger</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-subtle mt-2">
            Net worth · projection · spend
          </div>
        </Link>
        {userEmail && (
          <div className="mt-4 text-[11px] text-ink-faint truncate font-mono" title={userEmail}>
            {userEmail}
          </div>
        )}
      </div>

      <div className="border-t" />

      <nav className="flex-1 px-3 py-4">
        {items.map((item, idx) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={`${item.href}${wsQuery}`}
              className={
                "group flex items-center gap-3 px-3 py-2 text-sm transition-colors " +
                (active
                  ? "text-ink"
                  : "text-ink-subtle hover:text-ink")
              }
            >
              <span
                className={
                  "font-mono text-[10px] tabular-nums w-6 " +
                  (active ? "text-oxblood" : "text-ink-faint")
                }
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className={active ? "italic font-serif text-base leading-none" : ""}>
                {item.label}
              </span>
              {active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-oxblood" />
              )}
            </Link>
          );
        })}
      </nav>

      <form action="/auth/signout" method="post" className="px-6 py-4 border-t">
        <button className="text-[11px] uppercase tracking-[0.18em] text-ink-faint hover:text-ink">
          Sign out
        </button>
      </form>
    </aside>
  );
}
