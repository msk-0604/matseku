import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { addDays, formatDate, jstDate, jstTime, jstToIso, mondayOf, todayJst } from "@/lib/date";
import type { Slot } from "@/lib/types";
import { ActionForm } from "@/components/action-form";
import { PageLoading } from "@/components/loading";
import { addSlots, deleteSlot } from "./actions";

export const metadata: Metadata = { title: "空き枠" };

export default function SlotsPage({ searchParams }: PageProps<"/app/slots">) {
  return (
    <>
      <h1 className="mb-3 text-xl font-bold">空き枠</h1>
      <Suspense fallback={<PageLoading />}>
        <Slots searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const TIMES = Array.from({ length: (22 - 8) * 2 + 1 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

async function Slots({ searchParams }: { searchParams: PageProps<"/app/slots">["searchParams"] }) {
  const sp = await searchParams;
  const { supabase } = await requireSalon();
  const today = todayJst();
  const week = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? mondayOf(sp.week) : mondayOf(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  const { data } = await supabase
    .from("slots")
    .select("id, starts_at, ends_at, is_booked")
    .gte("starts_at", jstToIso(week, "00:00"))
    .lt("starts_at", jstToIso(addDays(week, 7), "00:00"))
    .order("starts_at")
    .overrideTypes<Slot[], { merge: false }>();
  const slots = data ?? [];

  return (
    <div className="space-y-4">
      <details className="card" open={slots.length === 0}>
        <summary className="cursor-pointer font-bold">＋ 枠を追加</summary>
        <div className="mt-3">
          <ActionForm action={addSlots} submitLabel="追加する">
            <div>
              <label htmlFor="date" className="label">日付</label>
              <input id="date" name="date" type="date" required min={today} defaultValue={days.find((d) => d >= today) ?? today} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="start" className="label">開始</label>
                <select id="start" name="start" defaultValue="10:00" className="input">
                  {TIMES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="end" className="label">終了</label>
                <select id="end" name="end" defaultValue="11:30" className="input">
                  {TIMES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="repeat" className="label">くり返し</label>
              <select id="repeat" name="repeat" defaultValue="1" className="input">
                <option value="1">この日だけ</option>
                <option value="4">毎週同じ曜日・時間（4週間分）</option>
                <option value="8">毎週同じ曜日・時間（8週間分）</option>
              </select>
            </div>
          </ActionForm>
        </div>
      </details>

      <div className="flex items-center justify-between">
        <Link href={`/app/slots?week=${addDays(week, -7)}`} className="btn-secondary px-3 text-sm">← 前の週</Link>
        <span className="text-sm font-bold">{formatDate(week, today)}〜{formatDate(addDays(week, 6), today)}</span>
        <Link href={`/app/slots?week=${addDays(week, 7)}`} className="btn-secondary px-3 text-sm">次の週 →</Link>
      </div>

      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {days.map((d) => {
          const list = slots.filter((s) => jstDate(s.starts_at) === d);
          return (
            <li key={d} className={`flex gap-3 px-4 py-3 ${d < today ? "opacity-50" : ""}`}>
              <div className={`w-16 shrink-0 text-sm font-semibold ${d === today ? "text-brand-600" : ""}`}>{formatDate(d, today)}</div>
              <div className="flex flex-1 flex-wrap gap-2">
                {list.length === 0 && <span className="text-sm text-neutral-400">—</span>}
                {list.map((s) =>
                  s.is_booked ? (
                    <span key={s.id} className="chip bg-brand-100 px-2.5 py-1 text-sm text-brand-700">
                      {jstTime(s.starts_at)}〜{jstTime(s.ends_at)} 予約済
                    </span>
                  ) : (
                    <form key={s.id} action={deleteSlot.bind(null, s.id)} className="inline-flex">
                      <span className="chip gap-1 border border-neutral-300 py-0.5 pr-0.5 pl-2.5 text-sm">
                        {jstTime(s.starts_at)}〜{jstTime(s.ends_at)}
                        <button className="flex size-7 items-center justify-center rounded-full text-neutral-400 active:bg-neutral-100" aria-label="この枠を削除">×</button>
                      </span>
                    </form>
                  ),
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutral-500">空き枠は、お客さまのLINE予約ページ（4週間先まで）に表示されます。×で削除できます（予約済みの枠は削除できません）。</p>
    </div>
  );
}
