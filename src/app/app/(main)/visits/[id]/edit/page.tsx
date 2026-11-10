import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSalon } from "@/lib/auth";
import { signedPhotoUrls } from "@/lib/photos";
import type { Visit } from "@/lib/types";
import { VisitForm } from "@/components/visit-form";
import { PageLoading } from "@/components/loading";
import { saveVisit } from "../../actions";

export const metadata: Metadata = { title: "来店記録の編集" };

export default function EditVisitPage({ params }: PageProps<"/app/visits/[id]/edit">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <EditVisit params={params} />
    </Suspense>
  );
}

async function EditVisit({ params }: { params: PageProps<"/app/visits/[id]/edit">["params"] }) {
  const { id } = await params;
  const { supabase, salon } = await requireSalon();
  const { data: visit } = await supabase
    .from("visits")
    .select("*, customers(name), visit_photos(id, storage_path, created_at)")
    .eq("id", id)
    .maybeSingle<Visit & { customers: { name: string }; visit_photos: { id: string; storage_path: string; created_at: string }[] }>();
  if (!visit) notFound();

  const photos = await signedPhotoUrls(
    supabase,
    [...visit.visit_photos].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );

  return (
    <>
      <Link href={`/app/visits/${id}`} className="text-sm text-neutral-500">← 来店記録</Link>
      <h1 className="mt-2 mb-4 text-xl font-bold">来店記録の編集：{visit.customers.name}さん</h1>
      <VisitForm
        action={saveVisit.bind(null, { visitId: id, customerId: visit.customer_id, isNew: false })}
        salonId={salon.id}
        visitId={id}
        initial={visit}
        existingPhotos={photos}
        submitLabel="保存する"
      />
    </>
  );
}
