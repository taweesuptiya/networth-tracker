"use client";

import { useState } from "react";

export const ONBOARDING_KEY = "ledger_onboarded_v1";

const steps = [
  {
    num: "01",
    tag: "Welcome",
    title: "Your personal ledger.",
    body: "Ledger tracks your net worth, monthly spending, and financial future — all in one place. This quick tour will walk you through everything in under a minute.",
  },
  {
    num: "02",
    tag: "Dashboard",
    title: "See where you stand.",
    body: "The dashboard shows your total net worth across all assets — stocks, cash, property, crypto — converted to your base currency. The chart tracks how it moves over time.",
  },
  {
    num: "03",
    tag: "Upload & Transactions",
    title: "Import your bank statements.",
    body: "Upload PDF statements from your bank. Ledger reads the transactions automatically and links them to the right account. You can also browse, search, and filter every transaction.",
  },
  {
    num: "04",
    tag: "Accounts & Rules",
    title: "Manage assets and categories.",
    body: "Add your assets and set their price source (Yahoo Finance, Finnomena, or manual). Create rules to auto-categorise transactions so your monthly review is always clean.",
  },
  {
    num: "05",
    tag: "Review & Projection",
    title: "Review the past, plan the future.",
    body: "Monthly review connects each month's spending to your asset balance change. Projection forecasts your net worth based on your savings rate — so you can see when you hit your goals.",
  },
];

export function OnboardingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  function handleClose() {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setStep(0);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Card */}
      <div className="relative bg-paper border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-px bg-ink/10 w-full">
          <div
            className="h-px bg-oxblood transition-all duration-500"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-8">
          {/* Tag + step counter */}
          <div className="flex items-center justify-between mb-6">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-oxblood">
              {current.tag}
            </span>
            <span className="text-[10px] font-mono text-ink-faint">
              {current.num} / {String(steps.length).padStart(2, "0")}
            </span>
          </div>

          {/* Title */}
          <h2 className="display text-3xl leading-tight mb-4">
            {current.title}
          </h2>

          {/* Body */}
          <p className="text-sm text-ink-subtle leading-relaxed min-h-[72px]">
            {current.body}
          </p>

          {/* Dot indicators */}
          <div className="flex gap-1.5 mt-6 mb-8">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={
                  "h-1 rounded-full transition-all duration-300 " +
                  (i === step ? "w-5 bg-oxblood" : "w-1.5 bg-ink/20 hover:bg-ink/40")
                }
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              className="text-[11px] uppercase tracking-[0.18em] text-ink-faint hover:text-ink transition-colors"
              onClick={handleClose}
            >
              Skip
            </button>

            <div className="flex gap-2">
              {!isFirst && (
                <button
                  className="text-[11px] uppercase tracking-[0.18em] px-4 py-2 border rounded-lg text-ink-subtle hover:text-ink transition-colors"
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </button>
              )}
              <button
                className="text-[11px] uppercase tracking-[0.18em] px-4 py-2 bg-ink text-paper rounded-lg hover:opacity-90 transition-opacity"
                onClick={() => (isLast ? handleClose() : setStep(step + 1))}
              >
                {isLast ? "Get started" : "Next →"}
              </button>
            </div>
          </div>
        </div>

        {/* Close × */}
        <button
          className="absolute top-4 right-4 text-ink-faint hover:text-ink transition-colors p-1"
          onClick={handleClose}
          aria-label="Close"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
