import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { hkdfSync } from "node:crypto";

/*
 * お客さま専用の予約URL（/r/<token>）。
 * token = base64url(JSON) + "." + 署名。サロン・お客さま・どの案内か・有効期限を含む。
 * ログインなしで開けるが、署名を改ざんすると無効になる。
 */

export const BOOKING_LINK_DAYS = 30;

type Payload = { s: string; c: string; r?: string; e: number };
export type BookingLink = { salonId: string; customerId: string; reminderId: string | null; expiresAt: number };

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY が設定されていません");
  return Buffer.from(hkdfSync("sha256", Buffer.from(raw, "base64"), Buffer.alloc(0), "repaircall:booking-link", 32));
}

const mac = (body: string) => createHmac("sha256", key()).update(body).digest("base64url").slice(0, 32);

export function createBookingToken(input: { salonId: string; customerId: string; reminderId?: string | null; days?: number }): string {
  const payload: Payload = {
    s: input.salonId,
    c: input.customerId,
    ...(input.reminderId ? { r: input.reminderId } : {}),
    e: Math.floor(Date.now() / 1000) + (input.days ?? BOOKING_LINK_DAYS) * 86_400,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function bookingUrl(base: string, input: Parameters<typeof createBookingToken>[0]): string {
  return `${base}/r/${createBookingToken(input)}`;
}

/** 署名が正しければ中身を返す（期限切れは expired: true） */
export function readBookingToken(token: string): { link: BookingLink; expired: boolean } | null {
  if (!token || token.length > 500) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (typeof p.s !== "string" || typeof p.c !== "string" || typeof p.e !== "number") return null;
    return {
      link: { salonId: p.s, customerId: p.c, reminderId: p.r ?? null, expiresAt: p.e },
      expired: p.e * 1000 < Date.now(),
    };
  } catch {
    return null;
  }
}
