"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { OnboardingModal, ONBOARDING_KEY } from "./onboarding-modal";

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Auto-show for first-time users
  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      setOnboardingOpen(true);
    }
  }, []);

  function openOnboarding() {
    setOnboardingOpen(true);
  }

  function closeOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setOnboardingOpen(false);
  }

  return (
    <div className="flex h-screen overflow-hidden">
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
        <span className="display text-2xl leading-none flex-1">Ledger</span>
        {/* Help button — mobile */}
        <button
          onClick={openOnboarding}
          aria-label="Help"
          className="w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-mono text-ink-faint hover:text-ink hover:border-ink transition-colors"
        >
          ?
        </button>
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
        onHelp={openOnboarding}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto pt-14 md:pt-0">
        {children}
      </div>

      <OnboardingModal open={onboardingOpen} onClose={closeOnboarding} />
    </div>
  );
}
