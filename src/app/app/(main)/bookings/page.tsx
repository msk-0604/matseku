import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { addDays, formatDate, jstDate, jstTime, jstToIso, todayJst } from "@/lib/date";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PageLoading } from "@/components/loading";
import { cancelBooking } from "./actions";

export const metadata: Metadata = { title: "予約" };

type Row = {
  id: string;
  status: string;
  source: "reminder" | "direct";
  customers: { id: string; name: string; allergy_note: string | null };
  slots: { starts_at: string; ends_at: string };
};

export default function BookingsPage() {
  return (
    <>
      <h1 className="mb-3 text-xl font-bold">予約</h1>
      <Suspense fallback={<PageLoading />}>
        <Bookings />
      </Suspense>
    </>
  );
}

function List({ items, empty, today }: { items: Row[]; empty: string; today: string }) {
  return (
    items.length === 0 ? (
      <p className="card text-sm text-neutral-500">{empty}</p>
    ) : (
      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <div className="w-20 shrink-0 text-sm">
              <div className="font-semibold">{jstTime(r.slots.starts_at)}</div>
              <div className="text-xs text-neutral-500">{formatDate(jstDate(r.slots.starts_at), today)}</div>
            </div>
            <Link href={`/app/customers/${r.customers.id}`} className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-semibold">{r.customers.name}</span>
                {r.customers.allergy_note && <span className="chip bg-red-100 text-red-700">注意</span>}
                {r.source === "reminder" && <span className="chip bg-brand-100 text-brand-700">案内から</span>}
                {r.status === "completed" && <span className="chip bg-neutral-100 text-neutral-600">来店済</span>}
              </div>
            </Link>
            {r.status === "confirmed" && (
              <form action={cancelBooking.bind(null, r.id)}>
                <ConfirmSubmit className="text-xs text-neutral-400 underline" message={`${r.customers.name}さんの予約を取り消して、枠を空きに戻します。よろしいですか？（お客さまへの連絡はサロンから行ってください）`}>
                  取消
                </ConfirmSubmit>
              </form>
            )}
          </li>
        ))}
      </ul>
    )
  );
}

async function Bookings() {
  const { supabase } = await requireSalon();
  const today = todayJst();
  const { data } = await supabase
    .from("bookings")
    .select("id, status, source, customers!inner(id, name, allergy_note), slots!inner(starts_at, ends_at)")
    .in("status", ["confirmed", "completed"])
    .gte("slots.starts_at", jstToIso(today, "00:00"))
    .lt("slots.starts_at", jstToIso(addDays(today, 7), "00:00"))
    .overrideTypes<Row[], { merge: false }>();
  const rows = (data ?? []).sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const todays = rows.filter((r) => jstDate(r.slots.starts_at) === today);
  const later = rows.filter((r) => jstDate(r.slots.starts_at) !== today);

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 font-bold">今日 {formatDate(today, today)}</h2>
        <List items={todays} empty="今日の予約はありません" today={today} />
      </section>
      <section>
        <h2 className="mb-2 font-bold">この先1週間</h2>
        <List items={later} empty="予約はありません" today={today} />
      </section>
    </div>
  );
}
