"use server";

import { z } from "zod";
import { sign } from "@/lib/crypto";
import { verifyLiffUser } from "@/lib/line";
import { isActiveStatus } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * お客さま（LIFF）用のサーバー処理。
 * ログインの代わりに LIFF のアクセストークンを LINE に問い合わせて本人確認する。
 * service role を使うので、必ず salon_id と line_user_id で絞り込むこと。
 */

const uuid = z.uuid();
const BOOKING_WINDOW_DAYS = 28;
const REMINDER_ATTRIBUTION_DAYS = 14;

type Ctx = { admin: ReturnType<typeof createAdminClient>; salonId: string; lineUserId: string };

async function authenticate(salonId: string, accessToken: string): Promise<Ctx | { error: string }> {
  if (!uuid.safeParse(salonId).success) return { error: "ページが見つかりません" };
  const admin = createAdminClient();
  const { data: salon } = await admin.from("salons").select("id, liff_id, subscription_status").eq("id", salonId).maybeSingle();
  if (!salon?.liff_id) return { error: "このサロンは準備中です" };
  if (!isActiveStatus(salon.subscription_status)) return { error: "現在、LINEからのご予約を受け付けていません。サロンへ直接ご連絡ください" };
  const lineUserId = await verifyLiffUser(accessToken, salon.liff_id);
  if (!lineUserId) return { error: "LINEの認証に失敗しました。ページを開き直してください" };
  return { admin, salonId, lineUserId };
}

// ---------------------------------------------------------------------------
// LINE連携
// ---------------------------------------------------------------------------

export type LinkResult = { ok: true } | { ok: false; error: string };

export async function linkCustomer(input: { salonId: string; token: string; accessToken: string }): Promise<LinkResult> {
  const auth = await authenticate(input.salonId, input.accessToken);
  if ("error" in auth) return { ok: false, error: auth.error };
  const { admin, salonId, lineUserId } = auth;

  if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.token)) return { ok: false, error: "QRコードが正しくありません" };

  const { data: link } = await admin
    .from("link_tokens")
    .select("id, customer_id, expires_at, used_at")
    .eq("salon_id", salonId)
    .eq("token", input.token)
    .maybeSingle();
  if (!link) return { ok: false, error: "QRコードが正しくありません。サロンで新しいQRを表示してもらってください" };
  if (link.used_at) return { ok: false, error: "このQRコードはすでに使われています。サロンで新しいQRを表示してもらってください" };
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "QRコードの有効期限が切れています。サロンで新しいQRを表示してもらってください" };
  }

  // 1回だけ使えるように、先に使用済みにする（同時に押されても1回だけ成功）
  const { data: claimed } = await admin
    .from("link_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", link.id)
    .is("used_at", null)
    .select("id");
  if (!claimed?.length) return { ok: false, error: "このQRコードはすでに使われています" };

  // 同じLINEが別のお客さま（重複登録など）に連携されていたら外す
  await admin
    .from("customers")
    .update({ line_user_id: null })
    .eq("salon_id", salonId)
    .eq("line_user_id", lineUserId)
    .neq("id", link.customer_id);

  const { error } = await admin
    .from("customers")
    .update({ line_user_id: lineUserId, line_blocked: false })
    .eq("salon_id", salonId)
    .eq("id", link.customer_id);
  if (error) return { ok: false, error: "登録できませんでした。時間をおいてもう一度お試しください" };

  await admin.from("events").insert({ salon_id: salonId, type: "line_linked", props: {} });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 予約
// ---------------------------------------------------------------------------

export type SlotView = { id: string; starts_at: string; ends_at: string };
export type BookedView = SlotView & { bookingId: string; icsUrl: string };

export type BookingContext =
  | { ok: false; error: string }
  | { ok: true; linked: false }
  | { ok: true; linked: true; customerName: string; upcoming: BookedView | null; slots: SlotView[] };

function icsUrl(bookingId: string) {
  return `/api/ics/${bookingId}?s=${sign(`ics:${bookingId}`)}`;
}

async function findCustomer({ admin, salonId, lineUserId }: Ctx) {
  const { data } = await admin
    .from("customers")
    .select("id, name")
    .eq("salon_id", salonId)
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  return data;
}

async function findUpcoming(ctx: Ctx, customerId: string): Promise<BookedView | null> {
  const { data } = await ctx.admin
    .from("bookings")
    .select("id, slots!inner(id, starts_at, ends_at)")
    .eq("salon_id", ctx.salonId)
    .eq("customer_id", customerId)
    .eq("status", "confirmed")
    .gt("slots.starts_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const slot = data.slots as unknown as SlotView;
  return { ...slot, bookingId: data.id as string, icsUrl: icsUrl(data.id as string) };
}

export async function getBookingContext(input: { salonId: string; accessToken: string }): Promise<BookingContext> {
  const auth = await authenticate(input.salonId, input.accessToken);
  if ("error" in auth) return { ok: false, error: auth.error };

  const customer = await findCustomer(auth);
  if (!customer) return { ok: true, linked: false };

  const upcoming = await findUpcoming(auth, customer.id as string);
  const now = new Date();
  const until = new Date(now.getTime() + BOOKING_WINDOW_DAYS * 86_400_000);
  const { data: slots } = await auth.admin
    .from("slots")
    .select("id, starts_at, ends_at")
    .eq("salon_id", auth.salonId)
    .eq("is_booked", false)
    .gt("starts_at", now.toISOString())
    .lt("starts_at", until.toISOString())
    .order("starts_at")
    .limit(300);

  return { ok: true, linked: true, customerName: customer.name as string, upcoming, slots: (slots ?? []) as SlotView[] };
}

export type BookResult = { ok: true; booking: BookedView } | { ok: false; error: string; taken?: boolean };

export async function bookSlot(input: { salonId: string; accessToken: string; slotId: string }): Promise<BookResult> {
  const auth = await authenticate(input.salonId, input.accessToken);
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!uuid.safeParse(input.slotId).success) return { ok: false, error: "枠が見つかりません" };

  const customer = await findCustomer(auth);
  if (!customer) return { ok: false, error: "サロンでLINE連携を済ませてからご予約ください" };
  if (await findUpcoming(auth, customer.id as string)) {
    return { ok: false, error: "すでにご予約があります。変更はサロンへご連絡ください" };
  }

  // 案内（リマインド）を受け取ってから14日以内の予約は「案内からの予約」として数える
  const since = new Date(Date.now() - REMINDER_ATTRIBUTION_DAYS * 86_400_000).toISOString();
  const { data: reminder } = await auth.admin
    .from("reminders")
    .select("id")
    .eq("salon_id", auth.salonId)
    .eq("customer_id", customer.id)
    .eq("status", "sent")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: bookingId, error } = await auth.admin.rpc("book_slot", {
    p_salon_id: auth.salonId,
    p_customer_id: customer.id,
    p_slot_id: input.slotId,
    p_source: reminder ? "reminder" : "direct",
    p_reminder_id: reminder?.id ?? null,
  });
  if (error) return { ok: false, error: "予約できませんでした。時間をおいてもう一度お試しください" };
  if (!bookingId) return { ok: false, error: "申し訳ありません。この枠は先に埋まってしまいました。別の枠をお選びください", taken: true };

  await auth.admin.from("events").insert({
    salon_id: auth.salonId,
    type: "booking_created",
    props: { source: reminder ? "reminder" : "direct" },
  });

  const { data: slot } = await auth.admin.from("slots").select("id, starts_at, ends_at").eq("id", input.slotId).single();
  return { ok: true, booking: { ...(slot as SlotView), bookingId: bookingId as string, icsUrl: icsUrl(bookingId as string) } };
}
