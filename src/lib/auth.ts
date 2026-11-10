import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SALON_COLUMNS, type Salon } from "@/lib/types";

/**
 * ログイン中のサロンを返す（1リクエストにつき1回だけ問い合わせる）。
 * 未ログインなら /app/login、サロン未作成なら /app/no-salon へ移動する。
 * Server Component と Server Action の両方から呼ぶ。
 */
export const requireSalon = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/app/login");

  const { data: salon, error } = await supabase
    .from("salons")
    .select(SALON_COLUMNS)
    .eq("owner_user_id", userId)
    .maybeSingle<Salon>();
  if (error) throw new Error(`サロン情報の取得に失敗しました: ${error.message}`);
  if (!salon) redirect("/app/no-salon");

  return { supabase, salon, userId };
});
