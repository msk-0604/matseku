import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { CustomerForm } from "@/components/customer-form";
import { PageLoading } from "@/components/loading";
import { saveCustomer } from "../actions";

export const metadata: Metadata = { title: "お客さまの登録" };

export default function NewCustomerPage() {
  return (
    <>
      <Link href="/app/customers" className="text-sm text-neutral-500">← 顧客一覧</Link>
      <h1 className="mt-2 mb-4 text-xl font-bold">お客さまの登録</h1>
      <Suspense fallback={<PageLoading />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  const { salon } = await requireSalon();
  return (
    <CustomerForm
      action={saveCustomer.bind(null, null)}
      defaultRepairDays={salon.default_repair_days}
      submitLabel="登録する"
    />
  );
}
