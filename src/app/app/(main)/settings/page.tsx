import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { ActionForm } from "@/components/action-form";
import { PageLoading } from "@/components/loading";
import { CopyField } from "@/components/copy-field";
import { formatDateLong, jstDate } from "@/lib/date";
import { getBaseUrl } from "@/lib/url";
import { openBillingPortal, saveSalonSettings } from "./actions";
import { TemplateForm } from "./template-form";

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

const STATUS_LABEL: Record<string, string> = {
  trialing: "無料体験中",
  active: "ご契約中",
  past_due: "お支払い確認中",
  canceled: "解約済み",
  unpaid: "未払い",
  incomplete: "手続き未完了",
  incomplete_expired: "手続き期限切れ",
  paused: "一時停止中",
};

async function Settings() {
  const { salon } = await requireSalon();
  const base = await getBaseUrl();
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

      <section className="card">
        <h2 className="mb-1 font-bold">リペア案内の文面</h2>
        <p className="mb-3 text-sm text-neutral-600">毎朝10時ごろ、リペア時期のお客さまにLINEで届きます。</p>
        <TemplateForm initial={salon.reminder_template} salonName={salon.name} />
      </section>

      <section id="billing" className="card scroll-mt-20 space-y-3">
        <h2 className="font-bold">プラン・お支払い</h2>
        <p className="text-sm">
          {STATUS_LABEL[salon.subscription_status] ?? salon.subscription_status}
          {salon.plan && `（${salon.plan === "yearly" ? "年額" : "月額"}プラン）`}
          {salon.subscription_status === "trialing" && salon.trial_ends_at && (
            <span className="block text-neutral-600">無料体験は {formatDateLong(jstDate(salon.trial_ends_at))} まで</span>
          )}
        </p>
        {salon.stripe_subscription_id ? (
          <form action={openBillingPortal}>
            <button className="btn-secondary w-full">カード変更・領収書・解約</button>
          </form>
        ) : (
          <p className="text-xs text-neutral-500">お支払い情報が登録されていません（テスト用アカウント）</p>
        )}
      </section>

      {salon.referral_code && (
        <section className="card space-y-3">
          <h2 className="font-bold">お知り合いのサロンを紹介する</h2>
          <p className="text-sm leading-relaxed text-neutral-700">
            紹介したサロンが有料プランに切り替わると、<b>こちらも相手も1か月分（7,480円）割引</b>になります。
          </p>
          <CopyField label="紹介コード" value={salon.referral_code} />
          <CopyField label="紹介用URL" value={`${base}/?ref=${salon.referral_code}#pricing`} />
        </section>
      )}
    </div>
  );
}
