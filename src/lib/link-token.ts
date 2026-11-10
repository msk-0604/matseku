import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const TTL_MIN = 60;
// 読み間違えやすい文字（0/O, 1/I/L など）を除いた英数字
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const LINK_CODE_PREFIX = "連携コード";

function code(): string {
  return Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** トークに送ってもらう文 */
export function linkMessage(token: string): string {
  return `${LINK_CODE_PREFIX} ${token}`;
}

/** 送られてきた文から連携コードを取り出す（「連携コード ABC234」でもコードだけでもOK） */
export function parseLinkCode(text: string): string | null {
  const t = text.normalize("NFKC").toUpperCase().trim();
  const m = t.match(new RegExp(`^(?:${LINK_CODE_PREFIX}\\s*[:：]?\\s*)?([${ALPHABET}]{6})$`));
  return m ? m[1] : null;
}

/** LINE連携用のワンタイムコードを発行する（同じお客さまの未使用コードは無効にする） */
export async function issueLinkToken(supabase: SupabaseClient, customerId: string): Promise<string> {
  await supabase.from("link_tokens").delete().eq("customer_id", customerId).is("used_at", null);
  for (let i = 0; i < 5; i++) {
    const token = code();
    const { error } = await supabase.from("link_tokens").insert({
      customer_id: customerId,
      token,
      expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(),
    });
    if (!error) return token;
    if (error.code !== "23505") throw new Error(`連携コードを作れませんでした（${error.message}）`);
  }
  throw new Error("連携コードを作れませんでした。もう一度お試しください");
}
