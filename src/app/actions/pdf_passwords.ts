"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addPdfPassword(label: string, password: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };
  const { error } = await supabase
    .from("pdf_passwords")
    .insert({ user_id: user.id, label: label || null, password });
  if (error) return { error: error.message };
  revalidatePath("/statements");
  return { error: null };
}

export async function deletePdfPassword(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pdf_passwords").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/statements");
  return { error: null };
}
