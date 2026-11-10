import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSalon } from "@/lib/auth";
import { formatDateLong } from "@/lib/date";
import { SIDES, ZONES } from "@/lib/lash";
import { signedPhotoUrls } from "@/lib/photos";
import { yen } from "@/lib/text";
import type { Visit } from "@/lib/types";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PageLoading } from "@/components/loading";
import { deleteVisit } from "../actions";

export const metadata: Metadata = { title: "来店記録" };

export default function VisitPage({ params }: PageProps<"/app/visits/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <VisitDetail params={params} />
    </Suspense>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <dt className="w-24 shrink-0 text-sm text-neutral-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm whitespace-pre-wrap">{value || "—"}</dd>
    </div>
  );
}

async function VisitDetail({ params }: { params: PageProps<"/app/visits/[id]">["params"] }) {
  const { id } = await params;
  const { supabase } = await requireSalon();
  const { data: visit } = await supabase
    .from("visits")
    .select("*, customers(name), visit_photos(id, storage_path, created_at)")
    .eq("id", id)
    .maybeSingle<Visit & { customers: { name: string }; visit_photos: { id: string; storage_path: string; created_at: string }[] }>();
  if (!visit) notFound();

  const d = visit.lash_design ?? {};
  const photos = await signedPhotoUrls(
    supabase,
    [...visit.visit_photos].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );

  return (
    <div className="space-y-4">
      <Link href={`/app/customers/${visit.customer_id}`} className="text-sm text-neutral-500">← {visit.customers.name}さん</Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{formatDateLong(visit.visited_at)}</h1>
          <p className="text-sm text-neutral-600">{visit.menu || "（メニュー未入力）"}　{yen(visit.price)}</p>
        </div>
        <Link href={`/app/visits/${id}/edit`} className="btn-secondary shrink-0 text-sm">編集</Link>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="施術写真" className="size-full object-cover" />
            </a>
          ))}
        </div>
      )}

      <section className="card">
        <h2 className="mb-2 font-bold">マツエク設計</h2>
        <table className="mb-2 w-full table-fixed text-center text-sm">
          <thead>
            <tr className="text-neutral-500">
              <th className="w-10" />
              {ZONES.map((z) => <th key={z.key} className="font-medium">{z.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {SIDES.map((s) => (
              <tr key={s.key}>
                <th className="font-medium text-neutral-500">{s.label}</th>
                {ZONES.map((z) => (
                  <td key={z.key} className="py-1 text-base">{d.length?.[s.key]?.[z.key] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="divide-y divide-neutral-100">
          <Row label="施術メニュー" value={d.technique} />
          <Row label="カール" value={d.curl?.join("・")} />
          <Row label="太さ" value={d.thickness ? `${d.thickness}mm` : null} />
          <Row label="本数" value={d.count ? `${d.count}本` : null} />
          <Row label="カラー" value={d.color} />
          <Row label="グルー" value={d.glue} />
          <Row label="申し送り" value={d.next_note} />
        </dl>
      </section>

      <section className="card">
        <h2 className="mb-1 font-bold">メモ</h2>
        <p className="text-sm whitespace-pre-wrap">{visit.note || "—"}</p>
      </section>

      <form action={deleteVisit.bind(null, id)} className="pt-4">
        <ConfirmSubmit className="btn-danger w-full" message="この来店記録と写真を削除します。元に戻せません。よろしいですか？">
          この来店記録を削除
        </ConfirmSubmit>
      </form>
    </div>
  );
}
