import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// テスト時だけ LINE_API_BASE で差し替えられる（本番では設定しない）
const API = process.env.LINE_API_BASE ?? "https://api.line.me";

export type BotInfo = { userId: string; basicId: string; displayName: string; pictureUrl?: string };

async function lineFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
}

/** チャネルアクセストークンが有効か確認し、公式アカウントの情報を返す */
export async function getBotInfo(accessToken: string): Promise<BotInfo | null> {
  const res = await lineFetch("/v2/bot/info", accessToken);
  if (!res.ok) return null;
  return (await res.json()) as BotInfo;
}

/** Webhook の送り先URLを LINE に登録する */
export async function setWebhookEndpoint(accessToken: string, endpoint: string): Promise<boolean> {
  const res = await lineFetch("/v2/bot/channel/webhook/endpoint", accessToken, {
    method: "PUT",
    body: JSON.stringify({ endpoint }),
  });
  return res.ok;
}

/** LINE からテスト送信してもらう（署名の検証に成功すれば チャネルシークレットも正しい） */
export async function testWebhook(
  accessToken: string,
  endpoint: string,
): Promise<{ success: boolean; statusCode?: number; reason?: string }> {
  const res = await lineFetch("/v2/bot/channel/webhook/test", accessToken, {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) return { success: false, reason: `HTTP ${res.status}` };
  return (await res.json()) as { success: boolean; statusCode?: number; reason?: string };
}

/** Webhook の署名（x-line-signature）を検証 */
export function verifyLineSignature(channelSecret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", channelSecret).update(rawBody).digest("base64"));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** LIFF ID の前半は LINEログインチャネルのID */
export function loginChannelIdFromLiffId(liffId: string): string {
  return liffId.split("-")[0];
}

export function isValidLiffId(liffId: string): boolean {
  return /^\d{6,}-[A-Za-z0-9]{6,}$/.test(liffId);
}

/**
 * LIFF から受け取ったアクセストークンを LINE に問い合わせて検証し、LINE のユーザーIDを返す。
 * 他のサロンの LIFF で発行されたトークンは受け付けない。
 */
export async function verifyLiffUser(accessToken: string, liffId: string): Promise<string | null> {
  if (!accessToken || accessToken.length > 2000) return null;
  const verify = await fetch(`${API}/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`, {
    cache: "no-store",
  });
  if (!verify.ok) return null;
  const v = (await verify.json()) as { client_id?: string; expires_in?: number };
  if (v.client_id !== loginChannelIdFromLiffId(liffId) || !v.expires_in || v.expires_in <= 0) return null;

  const profile = await lineFetch("/v2/profile", accessToken);
  if (!profile.ok) return null;
  const p = (await profile.json()) as { userId?: string };
  return p.userId ?? null;
}

/** liff.line.me のURL（LINEアプリでLIFFを開く） */
export function liffUrl(liffId: string, path = "", query?: Record<string, string>): string {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  return `https://liff.line.me/${liffId}${path}${qs}`;
}

export type PushResult = { ok: true } | { ok: false; status: number; body: string };

/**
 * Push メッセージを1通送る。retryKey を付けると、同じキーの再送は LINE 側で重複しない。
 */
export async function pushMessage(
  accessToken: string,
  to: string,
  messages: unknown[],
  retryKey: string,
): Promise<PushResult> {
  let res: Response;
  try {
    res = await lineFetch("/v2/bot/message/push", accessToken, {
      method: "POST",
      headers: { "X-Line-Retry-Key": retryKey },
      body: JSON.stringify({ to, messages }),
    });
  } catch (e) {
    // 通信エラー（status 0 として扱い、再送の対象にする）
    return { ok: false, status: 0, body: String(e).slice(0, 500) };
  }
  // 409 は同じ retryKey で受付済み（＝送信済み）
  if (res.ok || res.status === 409) return { ok: true };
  return { ok: false, status: res.status, body: (await res.text()).slice(0, 500) };
}
