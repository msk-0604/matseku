"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import type { BookingFormState } from "@/app/app/(main)/bookings/actions";
import { CHANNELS, DURATIONS } from "@/lib/booking";

type CustomerOption = { id: string; name: string; name_kana: string; phone: string | null };

const toHira = (s: string) => s.normalize("NFKC").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export function BookingForm({
  action,
  customers,
  fixedCustomer,
  defaultDate,
}: {
  action: (prev: BookingFormState, fd: FormData) => Promise<BookingFormState>;
  customers: CustomerOption[];
  fixedCustomer?: { id: string; name: string };
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CustomerOption | { id: string; name: string } | null>(fixedCustomer ?? null);
  const [isNew, setIsNew] = useState(false);
  const [duration, setDuration] = useState<number>(90);
  const [channel, setChannel] = useState<string>("phone");

  const matches = useMemo(() => {
    const q = toHira(query.trim()).toLowerCase();
    if (!q) return [];
    const digits = q.replace(/\D/g, "");
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || c.name_kana.includes(q) || (digits.length >= 3 && c.phone?.includes(digits)))
      .slice(0, 8);
  }, [customers, query]);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="return" value={fixedCustomer ? "customer" : "bookings"} />
      <input type="hidden" name="duration" value={duration} />
      <input type="hidden" name="channel" value={channel} />

      <section className="card space-y-3">
        <h2 className="font-bold">お客さま</h2>
        {picked ? (
          <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
            <span className="font-semibold">{picked.name} さん</span>
            <input type="hidden" name="customer_id" value={picked.id} />
            {!fixedCustomer && (
              <button type="button" className="text-sm text-neutral-500 underline" onClick={() => setPicked(null)}>変更</button>
            )}
          </div>
        ) : isNew ? (
          <div className="space-y-3">
            <div>
              <label htmlFor="new_name" className="label">お名前</label>
              <input id="new_name" name="new_name" required className="input" placeholder="山田 花子" />
            </div>
            <div>
              <label htmlFor="new_kana" className="label">ふりがな</label>
              <input id="new_kana" name="new_kana" required className="input" placeholder="やまだ はなこ" />
            </div>
            <button type="button" className="text-sm text-neutral-500 underline" onClick={() => setIsNew(false)}>登録済みのお客さまから選ぶ</button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="input"
              placeholder="名前・ふりがな・電話で検索"
              aria-label="お客さまを検索"
              autoFocus
            />
            {matches.length > 0 && (
              <ul className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="w-full px-3 py-2 text-left active:bg-neutral-50" onClick={() => setPicked(c)}>
                      <span className="font-semibold">{c.name}</span>
                      <span className="ml-2 text-xs text-neutral-500">{c.name_kana}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query && matches.length === 0 && <p className="text-sm text-neutral-500">見つかりません</p>}
            <button type="button" className="btn-secondary w-full text-sm" onClick={() => setIsNew(true)}>＋ 新しいお客さま（はじめての方）</button>
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">日時</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="date" className="label">日付</label>
            <input id="date" name="date" type="date" required min={defaultDate} defaultValue={defaultDate} className="input" />
          </div>
          <div>
            <label htmlFor="start" className="label">開始</label>
            <input id="start" name="start" type="time" required step={300} defaultValue="10:00" className="input" />
          </div>
        </div>
        <fieldset>
          <legend className="label">所要時間</legend>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`rounded-full border px-3 py-1.5 text-sm ${duration === d ? "border-brand-600 bg-brand-600 text-white" : "border-neutral-300"}`}
              >
                {d}分
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">受付</legend>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setChannel(c.value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${channel === c.value ? "border-brand-600 bg-brand-600 text-white" : "border-neutral-300"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="note" className="label">メモ（メニューなど）</label>
          <input id="note" name="note" maxLength={500} className="input" placeholder="例：付け放題・オフあり" />
        </div>
      </section>

      <p className="text-xs leading-relaxed text-neutral-500">
        登録した日時と重なる空き枠は自動で「予約済み」になり、LINEから二重に予約されません。今日以降の予約があるお客さまには、リペア案内は送られません。
      </p>

      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.warning && (
        <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>⚠ {state.warning}</p>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" name="force" value="1" className="size-5 accent-brand-600" />
            重なっていても登録する
          </label>
        </div>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "登録中…" : "予約を登録する"}
      </button>
    </form>
  );
}
