import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { addDays, daysBetween, formatDate, todayJst } from "@/lib/date";
import { formatPhone } from "@/lib/text";
import type { CustomerOverview } from "@/lib/types";
import { PageLoading } from "@/components/loading";

export const metadata: Metadata = { title: "来なくなったお客さま" };

const LAPSED_DAYS = 45;

export default function LapsedPage() {
  return (
    <>
      <Link href="/app/customers" className="text-sm text-neutral-500">← 顧客一覧</Link>
      <h1 className="mt-2 text-xl font-bold">来なくなったお客さま</h1>
      <p className="mb-4 text-sm text-neutral-600">最後のご来店から{LAPSED_DAYS}日以上たっている方（長い順）</p>
      <Suspense fallback={<PageLoading />}>
        <Lapsed />
      </Suspense>
    </>
  );
}

async function Lapsed() {
  const { supabase } = await requireSalon();
  const today = todayJst();
  const { data } = await supabase
    .from("customer_overview")
    .select("id, name, name_kana, phone, line_user_id, line_blocked, last_visited_at, visit_count")
    .lte("last_visited_at", addDays(today, -LAPSED_DAYS))
    .order("last_visited_at", { ascending: true })
    .limit(500)
    .overrideTypes<CustomerOverview[], { merge: false }>();
  const list = data ?? [];

  if (list.length === 0) return <p className="card text-sm text-neutral-600">該当するお客さまはいません 🎉</p>;

  return (
    <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      {list.map((c) => (
        <li key={c.id}>
          <Link href={`/app/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-neutral-50">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold">{c.name}</span>
                {c.line_user_id && !c.line_blocked ? (
                  <span className="chip bg-green-100 text-green-700">LINE</span>
                ) : c.line_blocked ? (
                  <span className="chip bg-neutral-200 text-neutral-600">ブロック</span>
                ) : null}
              </div>
              <div className="text-xs text-neutral-500">
                来店{c.visit_count}回{c.phone ? `・${formatPhone(c.phone)}` : ""}
              </div>
            </div>
            <div className="shrink-0 text-right text-xs">
              <div>{formatDate(c.last_visited_at, today)}</div>
              <div className="font-semibold text-red-600">{daysBetween(c.last_visited_at!, today)}日</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
