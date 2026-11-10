import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSalon } from "@/lib/auth";
import type { Customer } from "@/lib/types";
import { CustomerForm } from "@/components/customer-form";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PageLoading } from "@/components/loading";
import { deleteCustomer, saveCustomer } from "../../actions";

export const metadata: Metadata = { title: "お客さま情報の編集" };

export default function EditCustomerPage({ params }: PageProps<"/app/customers/[id]/edit">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: { params: PageProps<"/app/customers/[id]/edit">["params"] }) {
  const { id } = await params;
  const { supabase, salon } = await requireSalon();
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle<Customer>();
  if (!customer) notFound();

  return (
    <>
      <Link href={`/app/customers/${id}`} className="text-sm text-neutral-500">← {customer.name}さん</Link>
      <h1 className="mt-2 mb-4 text-xl font-bold">お客さま情報の編集</h1>
      <CustomerForm
        action={saveCustomer.bind(null, id)}
        customer={customer}
        defaultRepairDays={salon.default_repair_days}
        submitLabel="保存する"
      />
      <form action={deleteCustomer.bind(null, id)} className="mt-10 border-t border-neutral-200 pt-6">
        <ConfirmSubmit
          className="btn-danger w-full"
          message={`${customer.name}さんを削除します。来店記録と写真もすべて削除され、元に戻せません。よろしいですか？`}
        >
          このお客さまを削除
        </ConfirmSubmit>
      </form>
    </>
  );
}
