"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage("Check your email for the confirmation link.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.replace("/");
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 p-8 shadow-sm">
        <h1 className="text-2xl font-semibold mb-1">Net Worth Tracker</h1>
        <p className="text-sm text-zinc-500 mb-6">
          {mode === "signin" ? "Sign in to your account" : "Create a new account"}
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "..." : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        {message && <p className="mt-3 text-sm text-green-600">{message}</p>}

        <button
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
          }}
          className="mt-6 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
