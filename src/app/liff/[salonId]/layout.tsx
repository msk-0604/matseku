import { Suspense } from "react";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { LiffProvider } from "../liff-provider";

async function SalonShell({ params, children }: { params: LayoutProps<"/liff/[salonId]">["params"]; children: React.ReactNode }) {
  const { salonId } = await params;
  const salon = z.uuid().safeParse(salonId).success
    ? (await createAdminClient().from("salons").select("id, name, liff_id, line_basic_id").eq("id", salonId).maybeSingle()).data
    : null;

  if (!salon?.liff_id) {
    return <p className="py-16 text-center text-sm text-neutral-500">このページは現在ご利用いただけません</p>;
  }
  return (
    <LiffProvider salon={{ id: salon.id, name: salon.name, liffId: salon.liff_id, basicId: salon.line_basic_id }}>
      <header className="border-b border-neutral-200 bg-white px-4 py-3 text-center font-bold">{salon.name}</header>
      <main className="px-4 py-5">{children}</main>
    </LiffProvider>
  );
}

export default function LiffLayout({ params, children }: LayoutProps<"/liff/[salonId]">) {
  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <Suspense fallback={<p className="py-16 text-center text-sm text-neutral-400">読み込み中…</p>}>
        <SalonShell params={params}>{children}</SalonShell>
      </Suspense>
    </div>
  );
}
