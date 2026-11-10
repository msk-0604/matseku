"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSalon } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { getBotInfo, setWebhookEndpoint, testWebhook } from "@/lib/line";
import { randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBaseUrl, webhookUrl } from "@/lib/url";
import { stripe } from "@/lib/stripe";

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

  const secretInput = String(fd.get("line_channel_secret") ?? "").trim();
  const tokenInput = String(fd.get("line_access_token") ?? "").replace(/\s+/g, "");
  if (secretInput && !/^[0-9a-f]{32}$/i.test(secretInput)) {
    return { error: "チャネルシークレットの形式が正しくありません（32文字の英数字）。前後に空白が入っていないか確認してください" };
  }

  const { data: current } = await admin
    .from("salons")
    .select("line_channel_secret, line_access_token, line_test_code")
    .eq("id", salon.id)
    .single();

  const secret = secretInput || (current?.line_channel_secret ? decrypt(current.line_channel_secret) : "");
  const token = tokenInput || (current?.line_access_token ? decrypt(current.line_access_token) : "");
  if (!secret) return { error: "チャネルシークレットを入力してください" };
  if (!token) return { error: "チャネルアクセストークンを入力してください" };

  const bot = await getBotInfo(token);
  if (!bot) return { error: "チャネルアクセストークンが正しくありません。「発行」を押して表示された長い文字列を、すべてコピーして貼り付けてください" };

  const { error } = await admin
    .from("salons")
    .update({
      line_channel_secret: encrypt(secret),
      line_access_token: encrypt(token),
      line_basic_id: bot.basicId,
      line_bot_name: bot.displayName,
      line_connected_at: new Date().toISOString(),
      line_test_code: current?.line_test_code ?? newTestCode(),
    })
    .eq("id", salon.id);
  if (error) return { error: `保存できませんでした（${error.message}）` };

  await admin.from("events").insert({ salon_id: salon.id, type: "line_connected", props: {} });
  revalidatePath("/app", "layout");

  // Webhook の送り先を登録してテストする（署名の検証が通れば、シークレットも正しい）
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
      message: `「${bot.displayName}」と接続しました。ただし確認に失敗しました（${test.statusCode === 401 ? "チャネルシークレットが違います" : (test.reason ?? `HTTP ${test.statusCode}`)}）。チャネルシークレットを貼り直してください`,
    };
  }
  return { ok: true, message: `「${bot.displayName}」と接続しました。次は「LINEの応答設定」に進んでください` };
}

function newTestCode(): string {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return `RC${Array.from({ length: 6 }, () => a[randomInt(a.length)]).join("")}`;
}

export async function saveReminderTemplate(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { supabase, salon } = await requireSalon();
  const template = String(fd.get("reminder_template") ?? "").trim();
  if (template.length > 300) return { error: "300文字以内にしてください" };
  const { error } = await supabase
    .from("salons")
    .update({ reminder_template: template || null })
    .eq("id", salon.id);
  if (error) return { error: `保存できませんでした（${error.message}）` };
  revalidatePath("/app/settings");
  return { ok: true, message: template ? "保存しました" : "初期の文面に戻しました" };
}

/** Stripe の Customer Portal（カード変更・領収書・解約）を開く */
export async function openBillingPortal() {
  const { salon } = await requireSalon();
  const admin = createAdminClient();
  const { data } = await admin.from("salons").select("stripe_customer_id").eq("id", salon.id).single();
  if (!data?.stripe_customer_id) redirect("/app/settings?billing=none");
  const base = await getBaseUrl();
  const session = await stripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${base}/app/settings`,
    locale: "ja",
  });
  redirect(session.url);
}

/** 初期設定：サロン名だけ保存 */
export async function saveSalonName(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { supabase, salon } = await requireSalon();
  const name = String(fd.get("name") ?? "").trim();
  if (!name || name.length > 100) return { error: "サロン名を入力してください（100文字以内）" };
  const { error } = await supabase.from("salons").update({ name }).eq("id", salon.id);
  if (error) return { error: `保存できませんでした（${error.message}）` };
  revalidatePath("/app", "layout");
  return { ok: true, message: "保存しました" };
}

/** 初期設定：リペア日数を確定 */
export async function confirmRepairDays(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const { supabase, salon } = await requireSalon();
  const days = Number(String(fd.get("default_repair_days") ?? "").normalize("NFKC"));
  if (!Number.isInteger(days) || days < 7 || days > 90) return { error: "7〜90日で入力してください" };
  const { error } = await supabase.from("salons").update({ default_repair_days: days }).eq("id", salon.id);
  if (error) return { error: `保存できませんでした（${error.message}）` };
  await supabase.from("events").insert({ salon_id: salon.id, type: "setup_repair_days", props: { days } });
  revalidatePath("/app", "layout");
  return { ok: true, message: `${days}日で設定しました` };
}
