import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { requireSalon } from "@/lib/auth";
import { daysBetween, formatDate, todayJst } from "@/lib/date";
import { digitsOnly, kanaRow, toHiragana } from "@/lib/text";
import type { CustomerOverview } from "@/lib/types";
import { PageLoading } from "@/components/loading";

export const metadata: Metadata = { title: "顧客一覧" };

export default function CustomersPage({ searchParams }: PageProps<"/app/customers">) {
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">顧客一覧</h1>
        <Link href="/app/customers/new" className="btn-primary">＋ 新規</Link>
      </div>
      <Link href="/app/customers/lapsed" className="mb-3 block text-sm text-brand-600">来なくなったお客さま（45日以上）→</Link>
      <Suspense fallback={<PageLoading />}>
        <CustomerList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** PostgREST の or() 構文を壊す文字を除く */
function sanitize(s: string): string {
  return s.replace(/[,()%*\\:"']/g, "").trim();
}

async function CustomerList({ searchParams }: { searchParams: PageProps<"/app/customers">["searchParams"] }) {
  const sp = await searchParams;
  const q = sanitize(typeof sp.q === "string" ? sp.q : "").slice(0, 50);
  const { supabase, salon } = await requireSalon();
  const today = todayJst();

  let query = supabase
    .from("customer_overview")
    .select("id, name, name_kana, phone, allergy_note, line_user_id, line_blocked, last_visited_at, visit_count, repair_days")
    .order("name_kana")
    .limit(1000);

  if (q) {
    const kana = sanitize(toHiragana(q));
    const digits = digitsOnly(q);
    const conds = [`name.ilike.%${q}%`, `name_kana.ilike.%${kana}%`];
    if (digits.length >= 3) conds.push(`phone.ilike.%${digits}%`);
    query = query.or(conds.join(","));
  }

  const { data, error } = await query.overrideTypes<CustomerOverview[], { merge: false }>();
  if (error) throw new Error(error.message);
  const customers = data ?? [];

  // ふりがなの行（あ行・か行…）ごとにまとめる
  const groups = new Map<string, CustomerOverview[]>();
  for (const c of customers) {
    const row = kanaRow(c.name_kana);
    groups.set(row, [...(groups.get(row) ?? []), c]);
  }

  return (
    <>
      <form role="search" className="mb-4 flex gap-2">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="名前・ふりがな・電話番号"
          className="input"
          enterKeyHint="search"
        />
        <button className="btn-secondary shrink-0">検索</button>
      </form>

      {customers.length === 0 ? (
        <div className="card text-center text-sm text-neutral-600">
          {q ? (
            <>「{q}」に一致するお客さまはいません。<Link href="/app/customers" className="mt-2 block text-brand-600">検索をクリア</Link></>
          ) : (
            <>まだお客さまが登録されていません。<br />右上の「＋ 新規」から登録できます。</>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">{customers.length}人</p>
          {[...groups.entries()].map(([row, list]) => (
            <section key={row}>
              <h2 className="sticky top-[53px] z-[1] bg-[#faf8f9] py-1 text-xs font-bold text-neutral-500">{row}</h2>
              <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                {list.map((c) => {
                  const since = c.last_visited_at ? daysBetween(c.last_visited_at, today) : null;
                  const repairDays = c.repair_days ?? salon.default_repair_days;
                  return (
                    <li key={c.id}>
                      <Link href={`/app/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-neutral-50">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-semibold">{c.name}</span>
                            {c.allergy_note && <span className="chip bg-red-100 text-red-700" title="アレルギー・注意事項あり">注意</span>}
                            {c.line_user_id && !c.line_blocked && <span className="chip bg-green-100 text-green-700">LINE</span>}
                          </div>
                          <div className="truncate text-xs text-neutral-500">{c.name_kana}</div>
                        </div>
                        <div className="shrink-0 text-right text-xs">
                          {c.last_visited_at ? (
                            <>
                              <div className="text-neutral-700">{formatDate(c.last_visited_at, today)}</div>
                              <div className={since != null && since >= repairDays ? "font-semibold text-brand-600" : "text-neutral-400"}>
                                {since === 0 ? "今日" : `${since}日前`}
                              </div>
                            </>
                          ) : (
                            <div className="text-neutral-400">来店なし</div>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
