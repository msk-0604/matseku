import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { addDays, jstMonth, jstToIso, todayJst } from "@/lib/date";
import { yen } from "@/lib/text";
import { CHANNELS } from "@/lib/booking";
import { PageLoading } from "@/components/loading";

export const metadata: Metadata = { title: "月次レポート" };

const LINE_FREE_LIMIT = 200;
const LAPSED_DAYS = 45;

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default function ReportPage({ searchParams }: PageProps<"/app/report">) {
  return (
    <>
      <h1 className="mb-3 text-xl font-bold">月次レポート</h1>
      <Suspense fallback={<PageLoading />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-brand-200 bg-brand-50" : "border-neutral-200 bg-white"}`}>
      <div className="text-xs text-neutral-600">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? "text-brand-700" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/app/report">["searchParams"] }) {
  const sp = await searchParams;
  const current = jstMonth();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) && sp.month <= current ? sp.month : current;
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;
  const fromIso = jstToIso(first, "00:00");
  const toIso = jstToIso(next, "00:00");
  const { supabase } = await requireSalon();

  const [sent, reminderBookings, returned, allVisits, usage, lapsed] = await Promise.all([
    supabase.from("reminders").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", fromIso).lt("sent_at", toIso),
    supabase.from("bookings").select("channel").eq("source", "reminder").neq("status", "canceled").gte("created_at", fromIso).lt("created_at", toIso),
    supabase
      .from("visits")
      .select("customer_id, price, bookings!inner(source)")
      .eq("bookings.source", "reminder")
      .gte("visited_at", first)
      .lt("visited_at", next),
    supabase.from("visits").select("customer_id, price").gte("visited_at", first).lt("visited_at", next),
    supabase.from("line_usage").select("push_count").eq("month", month).maybeSingle(),
    supabase.from("customer_overview").select("id", { count: "exact", head: true }).lte("last_visited_at", addDays(todayJst(), -LAPSED_DAYS)),
  ]);

  const returnedRows = (returned.data ?? []) as { customer_id: string; price: number | null }[];
  const returnedPeople = new Set(returnedRows.map((r) => r.customer_id)).size;
  const returnedSales = returnedRows.reduce((s, r) => s + (r.price ?? 0), 0);
  const visitRows = (allVisits.data ?? []) as { customer_id: string; price: number | null }[];
  const sales = visitRows.reduce((s, r) => s + (r.price ?? 0), 0);
  const pushCount = usage.data?.push_count ?? 0;
  const reminderRows = (reminderBookings.data ?? []) as { channel: string }[];
  const byChannel = CHANNELS.map((c) => ({ label: c.short, n: reminderRows.filter((r) => r.channel === c.value).length })).filter((c) => c.n > 0);
  const [y, m] = month.split("-");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/app/report?month=${shiftMonth(month, -1)}`} className="btn-secondary px-3 text-sm">← 前月</Link>
        <span className="font-bold">{y}年{Number(m)}月</span>
        {month < current ? (
          <Link href={`/app/report?month=${shiftMonth(month, 1)}`} className="btn-secondary px-3 text-sm">翌月 →</Link>
        ) : (
          <span className="w-[72px]" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat accent label="案内から戻った人数" value={`${returnedPeople}人`} sub="案内後14日以内の予約（電話等も含む）で来店" />
        <Stat accent label="案内から戻った売上" value={yen(returnedSales)} />
        <Stat label="案内の送信数" value={`${sent.count ?? 0}通`} />
        <Stat
          label="案内からの予約"
          value={`${reminderRows.length}件`}
          sub={byChannel.length ? byChannel.map((c) => `${c.label} ${c.n}`).join("・") : "この月に入った予約"}
        />
      </div>

      <section className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">LINE送信数</h2>
          <span className="text-sm"><b className="text-lg">{pushCount}</b> / {LINE_FREE_LIMIT}通</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div
            className={`h-full ${pushCount >= 190 ? "bg-red-500" : pushCount >= 150 ? "bg-amber-500" : "bg-brand-500"}`}
            style={{ width: `${Math.min(100, (pushCount / LINE_FREE_LIMIT) * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-neutral-500">LINE公式アカウントの無料プランは月200通です。190通に達すると、その月の自動案内を止めます。</p>
      </section>

      <section className="card">
        <h2 className="mb-1 font-bold">この月の来店</h2>
        <p className="text-sm">
          {visitRows.length}件・{new Set(visitRows.map((v) => v.customer_id)).size}人・売上 {yen(sales)}
        </p>
      </section>

      <Link href="/app/customers/lapsed" className="card flex items-center justify-between active:bg-neutral-50">
        <span>
          <span className="font-bold">来なくなったお客さま</span>
          <span className="block text-xs text-neutral-500">{LAPSED_DAYS}日以上ご来店がない方</span>
        </span>
        <span className="text-lg font-bold">{lapsed.count ?? 0}人 →</span>
      </Link>
    </div>
  );
}
