"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_AI_INSTRUCTIONS } from "@/lib/default-ai-instructions";

export async function setupWorkspaces() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Check if they already have workspaces (idempotent)
  const { data: existing } = await supabase
    .from("workspaces")
    .select("id")
    .eq("user_id", user.id);
  if (existing && existing.length > 0) redirect("/");

  const { error } = await supabase.from("workspaces").insert([
    {
      user_id: user.id,
      name: "Personal",
      base_currency: "THB",
      ai_categorization_instructions: DEFAULT_AI_INSTRUCTIONS,
    },
    {
      user_id: user.id,
      name: "Marriage",
      base_currency: "THB",
      ai_categorization_instructions: DEFAULT_AI_INSTRUCTIONS,
    },
  ]);

  if (error) redirect("/");
  redirect("/");
}
