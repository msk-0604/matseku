import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { DEFAULT_SALON_NAME, getSetupStatus } from "@/lib/setup";
import { ActionForm } from "@/components/action-form";
import { PageLoading } from "@/components/loading";
import { confirmRepairDays, saveSalonName } from "../settings/actions";

export const metadata: Metadata = { title: "初期設定" };

export default function SetupPage() {
  return (
    <>
      <h1 className="text-xl font-bold">初期設定</h1>
      <p className="mb-4 text-sm text-neutral-600">4つのステップで、リペア案内が自動で届くようになります。</p>
      <Suspense fallback={<PageLoading />}>
        <Wizard />
      </Suspense>
    </>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className={`card ${done ? "border-green-300" : ""}`}>
      <h2 className="mb-3 flex items-center gap-2 font-bold">
        <span className={`flex size-7 items-center justify-center rounded-full text-sm text-white ${done ? "bg-green-600" : "bg-brand-600"}`}>
          {done ? "✓" : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

async function Wizard() {
  const { supabase, salon } = await requireSalon();
  const st = await getSetupStatus(supabase, salon);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span>進み具合</span>
          <b>{st.done} / {st.total}</b>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full bg-brand-600" style={{ width: `${(st.done / st.total) * 100}%` }} />
        </div>
      </div>

      {st.complete && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-center">
          <p className="font-bold text-green-800">🎉 初期設定が完了しました</p>
          <p className="mt-1 text-sm text-green-900">来店を記録してお客さまにLINE連携QRを読み取ってもらうと、リペア時期に自動で案内が届きます。</p>
          <Link href="/app/customers" className="btn-primary mt-3 w-full">顧客一覧へ</Link>
        </div>
      )}

      <Step n={1} title="サロン名" done={st.name}>
        <ActionForm action={saveSalonName} submitLabel="保存する">
          <div>
            <label htmlFor="name" className="label">LINEの案内やお客さま用ページに表示されます</label>
            <input id="name" name="name" required defaultValue={salon.name === DEFAULT_SALON_NAME ? "" : salon.name} placeholder="例：Lash Salon ○○" className="input" />
          </div>
        </ActionForm>
      </Step>

      <Step n={2} title="LINE公式アカウントの接続" done={st.line}>
        <p className="mb-3 text-sm text-neutral-700">
          {st.line
            ? `「${salon.line_bot_name ?? "公式アカウント"}」と接続済みです。`
            : "LINE Developers で作った情報を貼り付けます。パソコンでの作業がおすすめです（10分ほど）。"}
        </p>
        <Link href="/app/settings/line" className={st.line ? "btn-secondary w-full" : "btn-primary w-full"}>
          {st.line ? "接続内容を確認する" : "手順を見て接続する"}
        </Link>
      </Step>

      <Step n={3} title="リペア日数" done={st.repairDays}>
        <ActionForm action={confirmRepairDays} submitLabel="この日数で決定">
          <div className="flex items-center gap-2">
            <input name="default_repair_days" inputMode="numeric" defaultValue={salon.default_repair_days} aria-label="リペア日数" className="input w-24" />
            <span className="text-sm text-neutral-700">日たったら案内を送る</span>
          </div>
          <p className="text-xs text-neutral-500">一般的なリペア周期は3〜4週間です。お客さまごとに変えることもできます。</p>
        </ActionForm>
      </Step>

      <Step n={4} title="空き枠の登録" done={st.slots}>
        <p className="mb-3 text-sm text-neutral-700">お客さまはLINEからこの空き枠を選んで予約します。毎週くり返しでまとめて登録できます。</p>
        <Link href="/app/slots" className={st.slots ? "btn-secondary w-full" : "btn-primary w-full"}>
          {st.slots ? "空き枠を確認する" : "空き枠を登録する"}
        </Link>
      </Step>
    </div>
  );
}
