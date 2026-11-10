"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSalon } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { getBotInfo, isValidLiffId, setWebhookEndpoint, testWebhook } from "@/lib/line";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl, webhookUrl } from "@/lib/url";

export type SettingsState = { ok?: boolean; error?: string; message?: string };

const salonSchema = z.object({
  name: z.string().trim().min(1, "サロン名を入力してください").max(100),
  default_repair_days: z.coerce.number().int().min(7, "7〜90日で入力してください").max(90, "7〜90日で入力してください"),
});

export async function saveSalonSettings(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { supabase, salon } = await requireSalon();
  const parsed = salonSchema.safeParse({
    name: fd.get("name"),
    default_repair_days: String(fd.get("default_repair_days") ?? "").normalize("NFKC"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };

  const { error } = await supabase.from("salons").update(parsed.data).eq("id", salon.id);
  if (error) return { error: `保存できませんでした（${error.message}）` };
  revalidatePath("/app", "layout");
  return { ok: true, message: "保存しました" };
}

export async function saveLineSettings(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { salon } = await requireSalon();
  const admin = createAdminClient();

  const channelId = String(fd.get("line_channel_id") ?? "").normalize("NFKC").trim();
  const secretInput = String(fd.get("line_channel_secret") ?? "").trim();
  const tokenInput = String(fd.get("line_access_token") ?? "").trim();
  const liffId = String(fd.get("liff_id") ?? "").normalize("NFKC").trim();

  if (!/^\d{6,20}$/.test(channelId)) return { error: "チャネルIDは数字で入力してください" };
  if (secretInput && !/^[0-9a-f]{32}$/i.test(secretInput)) return { error: "チャネルシークレットの形式が正しくありません（32文字の英数字）" };
  if (liffId && !isValidLiffId(liffId)) return { error: "LIFF ID の形式が正しくありません（例：1234567890-AbcdEfgh）" };

  const { data: current } = await admin
    .from("salons")
    .select("line_channel_secret, line_access_token")
    .eq("id", salon.id)
    .single();

  const secret = secretInput || (current?.line_channel_secret ? decrypt(current.line_channel_secret) : "");
  const token = tokenInput || (current?.line_access_token ? decrypt(current.line_access_token) : "");
  if (!secret) return { error: "チャネルシークレットを入力してください" };
  if (!token) return { error: "チャネルアクセストークンを入力してください" };

  const bot = await getBotInfo(token);
  if (!bot) return { error: "チャネルアクセストークンが正しくありません。LINE Developers で発行した「長期」のトークンを貼り付けてください" };

  const { error } = await admin
    .from("salons")
    .update({
      line_channel_id: channelId,
      line_channel_secret: encrypt(secret),
      line_access_token: encrypt(token),
      liff_id: liffId || null,
      line_basic_id: bot.basicId,
      line_bot_name: bot.displayName,
      line_connected_at: new Date().toISOString(),
    })
    .eq("id", salon.id);
  if (error) return { error: `保存できませんでした（${error.message}）` };

  await admin.from("events").insert({ salon_id: salon.id, type: "line_connected", props: {} });
  revalidatePath("/app", "layout");

  // Webhook の送り先を登録してテストする（失敗しても保存は完了している）
  const base = await getBaseUrl();
  if (base.startsWith("http://")) {
    return { ok: true, message: `「${bot.displayName}」と接続しました。※ローカル環境のため Webhook の登録は行っていません` };
  }
  const endpoint = webhookUrl(base, salon.id);
  const set = await setWebhookEndpoint(token, endpoint);
  const test = set ? await testWebhook(token, endpoint) : { success: false, reason: "Webhook URL を登録できませんでした" };
  if (!test.success) {
    return {
      ok: true,
      message: `「${bot.displayName}」と接続しました。ただし Webhook のテストに失敗しました（${test.reason ?? `HTTP ${test.statusCode}`}）。チャネルシークレットと、Vercel の Deployment Protection を確認してください`,
    };
  }
  return { ok: true, message: `「${bot.displayName}」と接続しました。Webhook のテストも成功しました` };
}
