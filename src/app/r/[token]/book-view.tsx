"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bookByToken, type BookedView, type SlotView } from "../actions";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const jst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000);
const dayKey = (iso: string) => jst(iso).toISOString().slice(0, 10);
const dayLabel = (iso: string) => {
  const d = jst(iso);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEK[d.getUTCDay()]})`;
};
const time = (iso: string) => jst(iso).toISOString().slice(11, 16);
const gcalDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** LINE の中のブラウザから、端末のブラウザで開く（カレンダーに取り込めるように） */
const external = (url: string) => `${url}${url.includes("?") ? "&" : "?"}openExternalBrowser=1`;

function CalendarButtons({ booking, salonName }: { booking: BookedView; salonName: string }) {
  const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: `${salonName} ご予約`,
    dates: `${gcalDate(booking.starts_at)}/${gcalDate(booking.ends_at)}`,
  })}`;
  return (
    <div className="grid grid-cols-2 gap-2">
      <a className="btn-secondary text-sm" href={external(booking.icsUrl)}>iPhoneのカレンダー</a>
      <a className="btn-secondary text-sm" href={external(google)} target="_blank" rel="noreferrer">Googleカレンダー</a>
    </div>
  );
}

export function BookedCard({ title, booking, salonName }: { title: string; booking: BookedView; salonName: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-300 bg-green-50 p-5 text-center">
        <p className="text-sm font-bold text-green-800">{title}</p>
        <p className="mt-2 text-2xl font-bold">{dayLabel(booking.starts_at)}</p>
        <p className="text-xl">{time(booking.starts_at)}〜{time(booking.ends_at)}</p>
      </div>
      <p className="text-center text-sm text-neutral-600">カレンダーに登録しておくと、前日に通知が届きます</p>
      <CalendarButtons booking={booking} salonName={salonName} />
      <p className="text-center text-xs text-neutral-500">日時の変更・キャンセルはサロンへ直接ご連絡ください</p>
    </div>
  );
}

export function BookView({ token, salonName, customerName, slots }: { token: string; salonName: string; customerName: string; slots: SlotView[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<SlotView | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BookedView | null>(null);

  if (done) return <BookedCard title="ご予約が完了しました" booking={done} salonName={salonName} />;

  const groups = new Map<string, SlotView[]>();
  for (const s of slots) groups.set(dayKey(s.starts_at), [...(groups.get(dayKey(s.starts_at)) ?? []), s]);

  return (
    <div className="space-y-4 pb-28">
      <p className="text-sm">{customerName} さま、ご希望の日時を選んでください。</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {groups.size === 0 ? (
        <p className="rounded-lg bg-neutral-100 p-4 text-sm text-neutral-700">
          現在、ご予約いただける空き枠がありません。お手数ですがサロンへ直接ご連絡ください。
        </p>
      ) : (
        [...groups.values()].map((list) => (
          <section key={list[0].id}>
            <h2 className="mb-2 text-sm font-bold text-neutral-600">{dayLabel(list[0].starts_at)}</h2>
            <div className="grid grid-cols-3 gap-2">
              {list.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className={`rounded-lg border py-3 text-base font-semibold ${selected?.id === s.id ? "border-brand-600 bg-brand-600 text-white" : "border-neutral-300 bg-white"}`}
                >
                  {time(s.starts_at)}
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {selected && (
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          <div className="mx-auto max-w-md space-y-2">
            <p className="text-center">
              <b>{dayLabel(selected.starts_at)} {time(selected.starts_at)}〜{time(selected.ends_at)}</b> で予約しますか？
            </p>
            <button
              disabled={sending}
              className="btn-primary w-full"
              onClick={async () => {
                setSending(true);
                setError(null);
                const res = await bookByToken(token, selected.id);
                setSending(false);
                if (res.ok) {
                  setDone(res.booking);
                  return;
                }
                setError(res.error);
                setSelected(null);
                if (res.taken) router.refresh();
              }}
            >
              {sending ? "予約中…" : "この日時で予約する"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
