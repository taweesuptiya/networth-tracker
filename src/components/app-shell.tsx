"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-1 min-h-screen">
      {/* Mobile top bar */}
      <header className="fixed top-0 inset-x-0 h-14 border-b flex items-center px-4 gap-3 bg-paper z-20 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="flex flex-col justify-center gap-[5px] p-1 -ml-1"
        >
          <span className="block h-px w-5 bg-ink" />
          <span className="block h-px w-5 bg-ink" />
          <span className="block h-px w-5 bg-ink" />
        </button>
        <span className="display text-2xl leading-none">Ledger</span>
      </header>

      {/* Backdrop */}
      <div
        className={
          "fixed inset-0 bg-black/40 z-30 md:hidden transition-opacity duration-300 " +
          (sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        userEmail={userEmail}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 pt-14 md:pt-0">
        {children}
      </div>
    </div>
  );
}
