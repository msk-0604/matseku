"use server";

import { readBookingToken } from "@/lib/booking-link";
import { sign } from "@/lib/crypto";
import { isActiveStatus } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * お客さま専用URL（/r/<token>）からの予約。
 * ログインの代わりに URL の署名で本人を確認する。service role を使うので必ず salon_id / customer_id で絞り込む。
 */

const BOOKING_WINDOW_DAYS = 28;
const REMINDER_ATTRIBUTION_DAYS = 14;

export type SlotView = { id: string; starts_at: string; ends_at: string };
export type BookedView = { bookingId: string; starts_at: string; ends_at: string; icsUrl: string };

export type BookingPageData =
  | { ok: false; reason: "invalid" | "expired" | "inactive" | "unlinked" }
  | { ok: true; salonName: string; customerName: string; upcoming: BookedView | null; slots: SlotView[] };

const icsUrl = (bookingId: string) => `/api/ics/${bookingId}?s=${sign(`ics:${bookingId}`)}`;

async function resolve(token: string) {
  const read = readBookingToken(token);
  if (!read) return { error: "invalid" as const };
  if (read.expired) return { error: "expired" as const };
  const { salonId, customerId, reminderId } = read.link;

  const admin = createAdminClient();
  const [{ data: salon }, { data: customer }] = await Promise.all([
    admin.from("salons").select("id, name, subscription_status").eq("id", salonId).maybeSingle(),
    admin.from("customers").select("id, name, line_user_id").eq("id", customerId).eq("salon_id", salonId).maybeSingle(),
  ]);
  if (!salon || !customer) return { error: "invalid" as const };
  if (!isActiveStatus(salon.subscription_status)) return { error: "inactive" as const };
  // LINE連携を外されたお客さまの古いURLは使えない
  if (!customer.line_user_id) return { error: "unlinked" as const };
  return { admin, salon, customer, reminderId };
}

async function findUpcoming(admin: ReturnType<typeof createAdminClient>, salonId: string, customerId: string): Promise<BookedView | null> {
  const { data } = await admin
    .from("bookings")
    .select("id, starts_at, ends_at")
    .eq("salon_id", salonId)
    .eq("customer_id", customerId)
    .eq("status", "confirmed")
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(1)
    .maybeSingle();
  return data ? { bookingId: data.id, starts_at: data.starts_at, ends_at: data.ends_at, icsUrl: icsUrl(data.id) } : null;
}

export async function loadBookingPage(token: string): Promise<BookingPageData> {
  const r = await resolve(token);
  if ("error" in r) return { ok: false, reason: r.error! };

  const upcoming = await findUpcoming(r.admin, r.salon.id, r.customer.id);
  const now = new Date();
  const { data: slots } = await r.admin
    .from("slots")
    .select("id, starts_at, ends_at")
    .eq("salon_id", r.salon.id)
    .eq("is_booked", false)
    .gt("starts_at", now.toISOString())
    .lt("starts_at", new Date(now.getTime() + BOOKING_WINDOW_DAYS * 86_400_000).toISOString())
    .order("starts_at")
    .limit(300);

  return { ok: true, salonName: r.salon.name, customerName: r.customer.name, upcoming, slots: (slots ?? []) as SlotView[] };
}

export type BookResult = { ok: true; booking: BookedView } | { ok: false; error: string; taken?: boolean };

export async function bookByToken(token: string, slotId: string): Promise<BookResult> {
  const r = await resolve(token);
  if ("error" in r) return { ok: false, error: "このページは使えなくなりました。トークで「予約」と送ってください" };
  if (!/^[0-9a-f-]{36}$/.test(slotId)) return { ok: false, error: "枠が見つかりません" };

  if (await findUpcoming(r.admin, r.salon.id, r.customer.id)) {
    return { ok: false, error: "すでにご予約があります。変更はサロンへご連絡ください" };
  }

  // 案内のURLから来た場合はその案内、そうでなければ14日以内に送った案内があれば「案内からの予約」
  let reminderId: string | null = null;
  const since = new Date(Date.now() - REMINDER_ATTRIBUTION_DAYS * 86_400_000).toISOString();
  const { data: reminder } = await r.admin
    .from("reminders")
    .select("id")
    .eq("salon_id", r.salon.id)
    .eq("customer_id", r.customer.id)
    .eq("status", "sent")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  reminderId = reminder?.id ?? null;

  const { data: bookingId, error } = await r.admin.rpc("book_slot", {
    p_salon_id: r.salon.id,
    p_customer_id: r.customer.id,
    p_slot_id: slotId,
    p_source: reminderId ? "reminder" : "direct",
    p_reminder_id: reminderId,
  });
  if (error) return { ok: false, error: "予約できませんでした。時間をおいてもう一度お試しください" };
  if (!bookingId) return { ok: false, error: "申し訳ありません。この枠は先に埋まってしまいました。別の枠をお選びください", taken: true };

  await r.admin.from("events").insert({
    salon_id: r.salon.id,
    type: "booking_created",
    props: { source: reminderId ? "reminder" : "direct", channel: "line", from_reminder_link: Boolean(r.reminderId) },
  });
  const booked = await findUpcoming(r.admin, r.salon.id, r.customer.id);
  return booked ? { ok: true, booking: booked } : { ok: false, error: "予約を確認できませんでした" };
}
