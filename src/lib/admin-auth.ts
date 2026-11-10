import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** admins テーブルに登録されたユーザーだけ通す（それ以外には 404 を返して存在を隠す） */
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/app/login");
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) notFound();
  return { userId: data.claims.sub };
});
