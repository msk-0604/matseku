import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { loadBookingPage } from "../actions";
import { BookedCard, BookView } from "./book-view";

export const metadata: Metadata = { title: "ご予約", robots: { index: false, follow: false }, referrer: "no-referrer" };

const REASONS = {
  invalid: "このページは開けません。お手数ですが、サロンのLINEのトークで「予約」と送ってください。",
  expired: "このページの有効期限が切れました。サロンのLINEのトークで「予約」と送ると、新しいご予約ページをお送りします。",
  inactive: "現在、LINEからのご予約を受け付けていません。お手数ですがサロンへ直接ご連絡ください。",
  unlinked: "このページは使えなくなりました。次回ご来店の際に、サロンでLINE連携をお願いします。",
} as const;

export default function BookingPage({ params }: PageProps<"/r/[token]">) {
  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <Suspense fallback={<p className="py-16 text-center text-sm text-neutral-400">読み込み中…</p>}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: { params: PageProps<"/r/[token]">["params"] }) {
  const { token } = await params;
  await connection();
  const data = await loadBookingPage(decodeURIComponent(token));
  if (!data.ok) {
    return <p className="m-4 rounded-lg bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">{REASONS[data.reason]}</p>;
  }
  return (
    <>
      <header className="border-b border-neutral-200 bg-white px-4 py-3 text-center font-bold">{data.salonName}</header>
      <main className="px-4 py-5">
        {data.upcoming ? (
          <BookedCard title="ご予約済みです" booking={data.upcoming} salonName={data.salonName} />
        ) : (
          <BookView token={token} salonName={data.salonName} customerName={data.customerName} slots={data.slots} />
        )}
      </main>
    </>
  );
}
