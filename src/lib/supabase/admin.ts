import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";

/**
 * service role（RLSを無視する）クライアント。
 * LINE のトークン保存、Webhook、お客さま用の予約ページの処理など、サーバー内だけで使う。
 * 呼び出し側で必ず salon_id を絞り込むこと。
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
