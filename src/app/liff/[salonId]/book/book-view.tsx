"use client";

import { useCallback, useEffect, useState } from "react";
import type { Liff } from "@line/liff";
import { bookSlot, getBookingContext, type BookedView, type BookingContext, type SlotView } from "../../actions";
import { LiffReady, useLiff } from "../../liff-provider";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", ...opts }).format(new Date(iso));
const dayKey = (iso: string) => fmt(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
const dayLabel = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEK[d.getUTCDay()]})`;
};
const time = (iso: string) => fmt(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
const gcalDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function CalendarButtons({ booking, salonName, liff }: { booking: BookedView; salonName: string; liff: Liff }) {
  const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: `${salonName} ご予約`,
    dates: `${gcalDate(booking.starts_at)}/${gcalDate(booking.ends_at)}`,
  })}`;
  const open = (url: string) => liff.openWindow({ url, external: true });
  return (
    <div className="grid grid-cols-2 gap-2">
      <button className="btn-secondary text-sm" onClick={() => open(new URL(booking.icsUrl, window.location.origin).toString())}>
        iPhoneのカレンダー
      </button>
      <button className="btn-secondary text-sm" onClick={() => open(google)}>
        Googleカレンダー
      </button>
    </div>
  );
}

function BookedCard({ title, booking, salonName, liff }: { title: string; booking: BookedView; salonName: string; liff: Liff }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-300 bg-green-50 p-5 text-center">
        <p className="text-sm font-bold text-green-800">{title}</p>
        <p className="mt-2 text-2xl font-bold">{dayLabel(booking.starts_at)}</p>
        <p className="text-xl">{time(booking.starts_at)}〜{time(booking.ends_at)}</p>
      </div>
      <p className="text-center text-sm text-neutral-600">カレンダーに登録しておくと、前日に通知が届きます</p>
      <CalendarButtons booking={booking} salonName={salonName} liff={liff} />
      <p className="text-center text-xs text-neutral-500">日時の変更・キャンセルはサロンへ直接ご連絡ください</p>
    </div>
  );
}

function Booker({ liff, accessToken }: { liff: Liff; accessToken: string }) {
  const { salon } = useLiff();
  const [ctx, setCtx] = useState<BookingContext | null>(null);
  const [selected, setSelected] = useState<SlotView | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BookedView | null>(null);

  const load = useCallback(async () => {
    setCtx(await getBookingContext({ salonId: salon.id, accessToken }));
  }, [salon.id, accessToken]);

  useEffect(() => {
    // 画面を開いたときに空き枠を読み込む
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (done) return <BookedCard title="ご予約が完了しました" booking={done} salonName={salon.name} liff={liff} />;
  if (!ctx) return <p className="py-16 text-center text-sm text-neutral-400">空き枠を読み込み中…</p>;
  if (!ctx.ok) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{ctx.error}</p>;
  if (!ctx.linked) {
    return (
      <p className="rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
        LINEからのご予約には、サロンでのLINE登録が必要です。次回ご来店の際に、サロンで表示されるQRコードを読み取ってください。
      </p>
    );
  }
  if (ctx.upcoming) return <BookedCard title="ご予約済みです" booking={ctx.upcoming} salonName={salon.name} liff={liff} />;

  const groups = new Map<string, SlotView[]>();
  for (const s of ctx.slots) groups.set(dayKey(s.starts_at), [...(groups.get(dayKey(s.starts_at)) ?? []), s]);

  return (
    <div className="space-y-4 pb-28">
      <p className="text-sm">{ctx.customerName} さま、ご希望の日時を選んでください。</p>
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
        <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
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
                const res = await bookSlot({ salonId: salon.id, accessToken, slotId: selected.id });
                setSending(false);
                if (res.ok) {
                  setDone(res.booking);
                  return;
                }
                setError(res.error);
                setSelected(null);
                if (res.taken) load();
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

export function BookView() {
  return <LiffReady>{({ liff, accessToken }) => <Booker liff={liff} accessToken={accessToken} />}</LiffReady>;
}
