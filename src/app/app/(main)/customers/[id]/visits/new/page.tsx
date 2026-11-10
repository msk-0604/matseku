import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSalon } from "@/lib/auth";
import { formatDate, todayJst } from "@/lib/date";
import type { LashDesign } from "@/lib/types";
import { VisitForm } from "@/components/visit-form";
import { PageLoading } from "@/components/loading";
import { saveVisit } from "../../../../visits/actions";

export const metadata: Metadata = { title: "来店記録" };

export default function NewVisitPage({ params }: PageProps<"/app/customers/[id]/visits/new">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewVisit params={params} />
    </Suspense>
  );
}

async function NewVisit({ params }: { params: PageProps<"/app/customers/[id]/visits/new">["params"] }) {
  const { id: customerId } = await params;
  const { supabase, salon } = await requireSalon();
  const today = todayJst();

  const [{ data: customer }, { data: last }] = await Promise.all([
    supabase.from("customers").select("id, name, allergy_note").eq("id", customerId).maybeSingle(),
    supabase
      .from("visits")
      .select("visited_at, menu, price, lash_design")
      .eq("customer_id", customerId)
      .order("visited_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!customer) notFound();

  // 前回の設計を最初から入れておく（申し送りは引き継がない）
  const lastDesign = (last?.lash_design ?? {}) as LashDesign;
  const visitId = crypto.randomUUID();

  return (
    <>
      <Link href={`/app/customers/${customerId}`} className="text-sm text-neutral-500">← {customer.name}さん</Link>
      <h1 className="mt-2 mb-3 text-xl font-bold">来店記録：{customer.name}さん</h1>
      {customer.allergy_note && (
        <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">⚠ {customer.allergy_note}</p>
      )}
      {lastDesign.next_note && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">前回の申し送り：{lastDesign.next_note}</p>
      )}
      <VisitForm
        action={saveVisit.bind(null, { visitId, customerId, isNew: true })}
        salonId={salon.id}
        visitId={visitId}
        initial={{
          visited_at: today,
          menu: (last?.menu as string | null) ?? null,
          price: (last?.price as number | null) ?? null,
          note: null,
          lash_design: { ...lastDesign, next_note: null },
        }}
        existingPhotos={[]}
        submitLabel="保存する"
        prefillNote={last ? `前回（${formatDate(last.visited_at as string, today)}）の内容を表示中` : undefined}
      />
    </>
  );
}
