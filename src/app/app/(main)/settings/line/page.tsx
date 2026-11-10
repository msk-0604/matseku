import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { LineConnectGuide, LineResponseGuide } from "@/components/line-guide";
import { PageLoading } from "@/components/loading";

export const metadata: Metadata = { title: "LINE接続" };

export default function LineSettingsPage() {
  return (
    <>
      <Link href="/app/settings" className="text-sm text-neutral-500">← 設定</Link>
      <h1 className="mt-2 mb-4 text-xl font-bold">LINE公式アカウントの接続</h1>
      <Suspense fallback={<PageLoading />}>
        <LineSettings />
      </Suspense>
    </>
  );
}

async function LineSettings() {
  const { salon } = await requireSalon();
  return (
    <div className="space-y-4">
      {salon.line_connected_at && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm">
          <b className="text-green-800">接続済み：{salon.line_bot_name}</b>
          {salon.line_basic_id && <span className="ml-2 text-green-700">{salon.line_basic_id}</span>}
          <div className="mt-1 text-green-800">応答設定の確認：{salon.line_webhook_verified_at ? "OK" : <span className="text-amber-800">まだです（下の手順へ）</span>}</div>
        </div>
      )}
      <section className="card">
        <h2 className="mb-3 font-bold">1. トークンとシークレットを貼り付ける</h2>
        <LineConnectGuide salon={salon} />
      </section>
      <section className="card">
        <h2 className="mb-3 font-bold">2. LINEの応答設定（Webhookオン・応答メッセージオフ）</h2>
        <LineResponseGuide salon={salon} />
      </section>
    </div>
  );
}
