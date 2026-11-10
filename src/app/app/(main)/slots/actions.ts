"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSalon } from "@/lib/auth";
import { addDays, jstToIso } from "@/lib/date";

export type SlotFormState = { ok?: boolean; error?: string; message?: string };

const schema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を選んでください"),
    start: z.string().regex(/^\d{2}:\d{2}$/, "開始時刻を選んでください"),
    end: z.string().regex(/^\d{2}:\d{2}$/, "終了時刻を選んでください"),
    repeat: z.coerce.number().int().min(1).max(12),
  })
  .refine((v) => v.end > v.start, { message: "終了時刻は開始時刻より後にしてください" });

/** 空き枠を追加（毎週くり返しも可）。既存の枠と重なる日はスキップする */
export async function addSlots(_prev: SlotFormState, fd: FormData): Promise<SlotFormState> {
  const { supabase } = await requireSalon();
  const parsed = schema.safeParse({
    date: fd.get("date"),
    start: fd.get("start"),
    end: fd.get("end"),
    repeat: fd.get("repeat") ?? "1",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { date, start, end, repeat } = parsed.data;

  const candidates = Array.from({ length: repeat }, (_, i) => {
    const d = addDays(date, i * 7);
    return { starts_at: jstToIso(d, start), ends_at: jstToIso(d, end) };
  }).filter((c) => new Date(c.starts_at).getTime() > Date.now());
  if (!candidates.length) return { error: "過去の日時には枠を作れません" };

  const { data: existing, error: exErr } = await supabase
    .from("slots")
    .select("starts_at, ends_at")
    .lt("starts_at", candidates.at(-1)!.ends_at)
    .gt("ends_at", candidates[0].starts_at);
  if (exErr) return { error: exErr.message };

  const overlaps = (c: { starts_at: string; ends_at: string }) =>
    (existing ?? []).some((e) => new Date(e.starts_at) < new Date(c.ends_at) && new Date(e.ends_at) > new Date(c.starts_at));
  const rows = candidates.filter((c) => !overlaps(c));
  const skipped = candidates.length - rows.length;

  if (rows.length) {
    const { error } = await supabase.from("slots").insert(rows);
    if (error) return { error: `保存できませんでした（${error.message}）` };
  }
  revalidatePath("/app/slots");
  return {
    ok: true,
    message: `${rows.length}枠を追加しました${skipped ? `（${skipped}枠は既存の枠と重なるためスキップ）` : ""}`,
  };
}

export async function deleteSlot(slotId: string) {
  const { supabase } = await requireSalon();
  // 予約が入っている枠は消さない
  await supabase.from("slots").delete().eq("id", slotId).eq("is_booked", false);
  revalidatePath("/app/slots");
}
