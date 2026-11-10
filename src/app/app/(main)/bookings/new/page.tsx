import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { todayJst } from "@/lib/date";
import { BookingForm } from "@/components/booking-form";
import { PageLoading } from "@/components/loading";
import { createBooking } from "../actions";

export const metadata: Metadata = { title: "予約の登録" };

export default function NewBookingPage({ searchParams }: PageProps<"/app/bookings/new">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewBooking searchParams={searchParams} />
    </Suspense>
  );
}

async function NewBooking({ searchParams }: { searchParams: PageProps<"/app/bookings/new">["searchParams"] }) {
  const sp = await searchParams;
  const customerId = typeof sp.customer === "string" ? sp.customer : null;
  const { supabase } = await requireSalon();

  const fixed = customerId
    ? (await supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle()).data
    : null;
  const { data: customers } = fixed
    ? { data: [] }
    : await supabase.from("customers").select("id, name, name_kana, phone").order("name_kana").limit(3000);

  return (
    <>
      <Link href={fixed ? `/app/customers/${fixed.id}` : "/app/bookings"} className="text-sm text-neutral-500">
        ← {fixed ? `${fixed.name}さんのカルテ` : "予約"}
      </Link>
      <h1 className="mt-2 mb-1 text-xl font-bold">予約の登録</h1>
      <p className="mb-4 text-sm text-neutral-600">電話やホットペッパーで受けた予約を登録します。空き枠がない日時でも登録できます。</p>
      <BookingForm
        action={createBooking}
        customers={(customers ?? []) as { id: string; name: string; name_kana: string; phone: string | null }[]}
        fixedCustomer={fixed ?? undefined}
        defaultDate={todayJst()}
      />
    </>
  );
}
