import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSalon } from "@/lib/auth";
import { addDays, daysBetween, formatDate, formatDateLong, formatSlot, todayJst } from "@/lib/date";
import { summarizeLash } from "@/lib/lash";
import { formatPhone, yen } from "@/lib/text";
import type { Customer, Visit } from "@/lib/types";
import { PageLoading } from "@/components/loading";
import { createLinkToken } from "../actions";

export const metadata: Metadata = { title: "カルテ" };

export default function CustomerPage({ params }: PageProps<"/app/customers/[id]">) {
  return (
    <>
      <Link href="/app/customers" className="text-sm text-neutral-500">← 顧客一覧</Link>
      <Suspense fallback={<PageLoading />}>
        <Karte params={params} />
      </Suspense>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-24 shrink-0 text-sm text-neutral-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm break-words whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function LineStatus({ c }: { c: Customer }) {
  if (!c.line_user_id) return <span className="chip bg-neutral-100 text-neutral-600">LINE未連携</span>;
  if (c.line_blocked) return <span className="chip bg-neutral-200 text-neutral-700">LINEブロック中</span>;
  return <span className="chip bg-green-100 text-green-700">LINE連携済み</span>;
}

async function Karte({ params }: { params: PageProps<"/app/customers/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, salon } = await requireSalon();
  const today = todayJst();

  const [{ data: customer }, { data: visitsData }, { data: upcoming }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle<Customer>(),
    supabase
      .from("visits")
      .select("id, visited_at, menu, price, lash_design, note, visit_photos(count)")
      .eq("customer_id", id)
      .order("visited_at", { ascending: false })
      .order("created_at", { ascending: false })
      .overrideTypes<(Visit & { visit_photos: { count: number }[] })[], { merge: false }>(),
    supabase
      .from("bookings")
      .select("id, source, slots!inner(starts_at, ends_at)")
      .eq("customer_id", id)
      .eq("status", "confirmed")
      .gte("slots.starts_at", new Date(`${today}T00:00:00+09:00`).toISOString())
      .limit(1)
      .maybeSingle<{ id: string; source: string; slots: { starts_at: string; ends_at: string } }>(),
  ]);
  if (!customer) notFound();
  const visits = visitsData ?? [];

  const repairDays = customer.repair_days ?? salon.default_repair_days;
  const last = visits[0];
  const nextRepair = last ? addDays(last.visited_at, repairDays) : null;

  return (
    <div className="mt-2 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold break-words">{customer.name}</h1>
          <p className="text-sm text-neutral-500">{customer.name_kana}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <LineStatus c={customer} />
            {customer.notify_opt_out && <span className="chip bg-neutral-100 text-neutral-600">自動案内オフ</span>}
          </div>
        </div>
        <Link href={`/app/customers/${id}/edit`} className="btn-secondary shrink-0 text-sm">編集</Link>
      </div>

      {/* アレルギー・注意事項は一番目立つ位置に */}
      {customer.allergy_note ? (
        <section className="rounded-xl border-2 border-red-300 bg-red-50 p-4" aria-label="アレルギー・注意事項">
          <h2 className="flex items-center gap-1 text-sm font-bold text-red-700">⚠ アレルギー・注意事項</h2>
          <p className="mt-1 whitespace-pre-wrap text-red-900">{customer.allergy_note}</p>
          <p className="mt-2 text-xs text-red-700">パッチテスト：{customer.patch_test_on ? formatDateLong(customer.patch_test_on) : "未実施"}</p>
        </section>
      ) : (
        <section className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600">
          アレルギー・注意事項：{customer.sensitive_consent ? "なし" : "記録なし（本人同意なし）"}
          <span className="mx-2 text-neutral-300">|</span>
          パッチテスト：{customer.patch_test_on ? formatDate(customer.patch_test_on, today) : "未実施"}
        </section>
      )}

      {upcoming && (
        <section className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
          <b>次回のご予約：</b>{formatSlot(upcoming.slots.starts_at, upcoming.slots.ends_at, today)}
          {upcoming.source === "reminder" && <span className="chip ml-2 bg-brand-100 text-brand-700">案内から</span>}
        </section>
      )}

      <Link href={`/app/customers/${id}/visits/new`} className="btn-primary w-full">＋ 来店を記録する</Link>

      {!customer.line_user_id && (
        <form action={createLinkToken.bind(null, id)}>
          <button className="btn-secondary w-full">LINE連携QRを表示</button>
        </form>
      )}

      <section className="card">
        <h2 className="mb-1 font-bold">リペアの目安</h2>
        {last && nextRepair ? (
          <p className="text-sm">
            前回 {formatDate(last.visited_at, today)}（{daysBetween(last.visited_at, today)}日前）→ 次回目安{" "}
            <b className={nextRepair <= today ? "text-brand-600" : ""}>{formatDate(nextRepair, today)}</b>
            <span className="text-neutral-500">（{repairDays}日周期）</span>
          </p>
        ) : (
          <p className="text-sm text-neutral-500">来店記録がまだありません</p>
        )}
      </section>

      <section className="card">
        <h2 className="mb-1 font-bold">基本情報</h2>
        <dl className="divide-y divide-neutral-100">
          <Row label="電話番号">
            {customer.phone ? <a href={`tel:${customer.phone}`} className="text-brand-600">{formatPhone(customer.phone)}</a> : "—"}
          </Row>
          <Row label="誕生日">{customer.birthday ? formatDateLong(customer.birthday) : "—"}</Row>
          <Row label="来店回数">{visits.length}回</Row>
          <Row label="メモ">{customer.memo || "—"}</Row>
        </dl>
      </section>

      <section>
        <h2 className="mb-2 font-bold">来店履歴</h2>
        {visits.length === 0 ? (
          <p className="card text-sm text-neutral-500">まだ来店記録がありません</p>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {visits.map((v) => {
              const photoCount = v.visit_photos?.[0]?.count ?? 0;
              return (
                <li key={v.id}>
                  <Link href={`/app/visits/${v.id}`} className="block px-4 py-3 active:bg-neutral-50">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{formatDate(v.visited_at, today)}</span>
                      <span className="text-sm text-neutral-700">{yen(v.price)}</span>
                    </div>
                    <div className="text-sm text-neutral-700">{v.menu || "（メニュー未入力）"}</div>
                    {summarizeLash(v.lash_design) && (
                      <div className="mt-0.5 text-xs text-neutral-500">{summarizeLash(v.lash_design)}</div>
                    )}
                    {v.lash_design?.next_note && (
                      <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">申し送り：{v.lash_design.next_note}</div>
                    )}
                    {photoCount > 0 && <div className="mt-1 text-xs text-neutral-400">📷 {photoCount}枚</div>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
