import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { PageLoading } from "@/components/loading";
import { saveSalonSettings } from "./actions";

export const metadata: Metadata = { title: "設定" };

export default function SettingsPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-bold">設定</h1>
      <Suspense fallback={<PageLoading />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const { salon } = await requireSalon();
  const connected = Boolean(salon.line_connected_at);
  return (
    <div className="space-y-4">
      <Link href="/app/settings/line" className="card flex items-center justify-between gap-3 active:bg-neutral-50">
        <div>
          <div className="font-bold">LINE公式アカウントの接続</div>
          <div className="text-sm text-neutral-600">
            {connected ? `接続済み：${salon.line_bot_name ?? ""}${salon.liff_id ? "" : "（LIFF未設定）"}` : "まだ接続されていません"}
          </div>
        </div>
        <span className={`chip shrink-0 ${connected && salon.liff_id ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
          {connected && salon.liff_id ? "OK" : "要設定"}
        </span>
      </Link>

      <section className="card">
        <h2 className="mb-3 font-bold">サロン情報</h2>
        <ActionForm action={saveSalonSettings} submitLabel="保存する">
          <div>
            <label htmlFor="name" className="label">サロン名（LINEの案内に表示されます）</label>
            <input id="name" name="name" required defaultValue={salon.name} className="input" />
          </div>
          <div>
            <label htmlFor="default_repair_days" className="label">リペア日数の初期値</label>
            <div className="flex items-center gap-2">
              <input id="default_repair_days" name="default_repair_days" inputMode="numeric" required defaultValue={salon.default_repair_days} className="input w-24" />
              <span className="text-sm text-neutral-600">日（前回の来店からこの日数でリペア案内）</span>
            </div>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
