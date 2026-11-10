import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomToken } from "@/lib/crypto";

const TTL_MIN = 60;

/** LINE連携QR用のワンタイムトークンを発行する（同じお客さまの未使用トークンは無効にする） */
export async function issueLinkToken(supabase: SupabaseClient, customerId: string): Promise<string> {
  await supabase.from("link_tokens").delete().eq("customer_id", customerId).is("used_at", null);
  const token = randomToken();
  const { error } = await supabase.from("link_tokens").insert({
    customer_id: customerId,
    token,
    expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(),
  });
  if (error) throw new Error(`QRを作れませんでした（${error.message}）`);
  return token;
}
