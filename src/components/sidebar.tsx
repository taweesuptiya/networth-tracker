"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/projection", label: "Projection", icon: "📈" },
  { href: "/statements", label: "Upload transactions", icon: "📤" },
  { href: "/transactions", label: "Transactions", icon: "📋" },
  { href: "/accounts", label: "Accounts & rules", icon: "🏦" },
];

export function Sidebar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const ws = params.get("ws");
  const wsQuery = ws ? `?ws=${ws}` : "";

  return (
    <aside className="w-56 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
      <div className="px-4 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="font-semibold text-sm">Net Worth</div>
        {userEmail && (
          <div className="text-xs text-zinc-500 truncate" title={userEmail}>
            {userEmail}
          </div>
        )}
      </div>
      <nav className="flex-1 p-2">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={`${item.href}${wsQuery}`}
              className={
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 " +
                (active
                  ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-900")
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <form action="/auth/signout" method="post" className="p-3 border-t border-zinc-200 dark:border-zinc-800">
        <button className="w-full text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 text-left">
          Sign out
        </button>
      </form>
    </aside>
  );
}
