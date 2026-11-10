"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSalon } from "@/lib/auth";
import { jstTime, jstToIso, todayJst } from "@/lib/date";
import { toHiragana } from "@/lib/text";

export async function cancelBooking(bookingId: string) {
  const { supabase, salon } = await requireSalon();
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) throw new Error(`取り消せませんでした（${error.message}）`);
  await supabase.from("events").insert({ salon_id: salon.id, type: "booking_canceled", props: {} });
  revalidatePath("/app/bookings");
  revalidatePath("/app/slots");
}

export type BookingFormState = { error?: string; warning?: string };

const bookingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選んでください"),
  start: z.string().regex(/^\d{2}:\d{2}$/, "開始時刻を選んでください"),
  duration: z.coerce.number().int().min(15, "所要時間を選んでください").max(480),
  channel: z.enum(["phone", "hotpepper", "line", "other"]),
  note: z
    .string()
    .trim()
    .max(500, "メモは500文字以内にしてください")
    .transform((v) => (v === "" ? null : v)),
});

/** サロンが予約を登録する（電話・ホットペッパーなど。空き枠がなくてもOK） */
export async function createBooking(_prev: BookingFormState, fd: FormData): Promise<BookingFormState> {
  const { supabase, salon } = await requireSalon();
  const parsed = bookingSchema.safeParse({
    date: fd.get("date"),
    start: fd.get("start"),
    duration: fd.get("duration"),
    channel: fd.get("channel"),
    note: String(fd.get("note") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  const { date, start, duration, channel, note } = parsed.data;
  if (date < todayJst()) return { error: "過去の日付には予約を登録できません" };

  const startsAt = jstToIso(date, start);
  const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();

  // ほかの予約と時間が重なるときは、確認してから登録する
  if (fd.get("force") !== "1") {
    const { data: overlaps } = await supabase
      .from("bookings")
      .select("starts_at, customers(name)")
      .eq("status", "confirmed")
      .lt("starts_at", endsAt)
      .gt("ends_at", startsAt)
      .limit(3);
    if (overlaps?.length) {
      const names = overlaps
        .map((o) => `${(o.customers as unknown as { name: string } | null)?.name ?? ""}さん（${jstTime(o.starts_at as string)}〜）`)
        .join("、");
      return { warning: `${names}の予約と時間が重なっています。` };
    }
  }

  // お客さま：既存を選ぶか、名前とふりがなでその場で登録
  let customerId = String(fd.get("customer_id") ?? "");
  if (!customerId) {
    const name = String(fd.get("new_name") ?? "").trim();
    const kana = toHiragana(String(fd.get("new_kana") ?? ""));
    if (!name) return { error: "お客さまを選ぶか、新しいお客さまの名前を入力してください" };
    if (!/^[ぁ-ゖー\s]+$/.test(kana)) return { error: "ふりがなは ひらがな で入力してください" };
    const { data, error } = await supabase.from("customers").insert({ name: name.slice(0, 100), name_kana: kana.slice(0, 100) }).select("id").single();
    if (error) return { error: `お客さまを登録できませんでした（${error.message}）` };
    customerId = data.id as string;
    await supabase.from("events").insert({ salon_id: salon.id, type: "customer_created", props: { from: "booking" } });
  }

  const { data: bookingId, error } = await supabase.rpc("salon_create_booking", {
    p_customer_id: customerId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_channel: channel,
    p_note: note,
  });
  if (error || !bookingId) return { error: `登録できませんでした（${error?.message ?? "不明なエラー"}）` };

  await supabase.from("events").insert({ salon_id: salon.id, type: "booking_created", props: { channel, by: "salon" } });
  revalidatePath("/app/bookings");
  revalidatePath("/app/slots");
  revalidatePath(`/app/customers/${customerId}`);

  const back = String(fd.get("return") ?? "");
  redirect(back === "customer" ? `/app/customers/${customerId}` : `/app/bookings?created=${date}`);
}
