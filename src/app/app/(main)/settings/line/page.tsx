import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSalon } from "@/lib/auth";
import { getBaseUrl, liffEndpointUrl, webhookUrl } from "@/lib/url";
import { ActionForm } from "@/components/action-form";
import { CopyField } from "@/components/copy-field";
import { PageLoading } from "@/components/loading";
import { saveLineSettings } from "../actions";

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

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="mb-2 flex items-center gap-2 font-bold">
        <span className="flex size-6 items-center justify-center rounded-full bg-brand-600 text-sm text-white">{n}</span>
        {title}
      </h2>
      <div className="space-y-2 text-sm leading-relaxed text-neutral-800">{children}</div>
    </section>
  );
}

async function LineSettings() {
  const { salon } = await requireSalon();
  const base = await getBaseUrl();
  const connected = Boolean(salon.line_connected_at);

  return (
    <div className="space-y-4">
      {connected ? (
        <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm">
          <b className="text-green-800">接続済み：{salon.line_bot_name}</b>
          {salon.line_basic_id && <span className="ml-2 text-green-700">{salon.line_basic_id}</span>}
          {!salon.liff_id && <p className="mt-1 text-amber-800">LIFF ID が未設定です。手順2を行ってください。</p>}
        </div>
      ) : (
        <p className="text-sm text-neutral-700">
          お客さまへの案内は、サロンの LINE公式アカウントから送られます。パソコンで LINE Developers を開いて、次の手順で設定してください（10分ほど）。
        </p>
      )}

      <Step n={1} title="Messaging API の情報をコピー">
        <ol className="list-decimal space-y-1 pl-5">
          <li>LINE Official Account Manager の「設定 → Messaging API」で「Messaging APIを利用する」を押す（プロバイダーを選ぶ画面が出たら作成）</li>
          <li>
            <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" className="text-brand-600 underline">LINE Developers</a>
            {" "}で、そのプロバイダーの「Messaging API」チャネルを開く
          </li>
          <li>「チャネル基本設定」の <b>チャネルID</b> と <b>チャネルシークレット</b> をコピー</li>
          <li>「Messaging API設定」の一番下、<b>チャネルアクセストークン（長期）</b>の「発行」を押してコピー</li>
        </ol>
      </Step>

      <Step n={2} title="お客さま用ページ（LIFF）を作る">
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>同じプロバイダー</b>で「新規チャネル作成 → LINEログイン」（アプリタイプ：ウェブアプリ）。※別のプロバイダーだと案内が送れません</li>
          <li>LINEログインチャネルの「チャネル基本設定」の「リンクされたLINE公式アカウント」で、このサロンの公式アカウントを選ぶ</li>
          <li>「LIFF」タブ →「追加」で次のとおり入力
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>LIFFアプリ名：予約</li>
              <li>サイズ：Full</li>
              <li>エンドポイントURL：下のURL</li>
              <li>Scope：profile にチェック</li>
              <li>友だち追加オプション：On (Aggressive)</li>
            </ul>
          </li>
          <li>作成された <b>LIFF ID</b> をコピー</li>
          <li>LINEログインチャネルの上部で「開発中」を<b>「公開済み」</b>に切り替え（開発中のままだとお客さまが開けません）</li>
        </ol>
        <CopyField label="エンドポイントURL" value={liffEndpointUrl(base, salon.id)} />
      </Step>

      <Step n={3} title="ここに貼り付けて保存">
        <ActionForm action={saveLineSettings} submitLabel={connected ? "更新して接続テスト" : "保存して接続テスト"} pendingLabel="接続を確認中…">
          <div>
            <label htmlFor="line_channel_id" className="label">チャネルID（Messaging API）</label>
            <input id="line_channel_id" name="line_channel_id" inputMode="numeric" required defaultValue={salon.line_channel_id ?? ""} className="input font-mono" />
          </div>
          <div>
            <label htmlFor="line_channel_secret" className="label">チャネルシークレット</label>
            <input id="line_channel_secret" name="line_channel_secret" autoComplete="off" required={!connected} className="input font-mono" placeholder={connected ? "設定済み（変更する場合のみ入力）" : ""} />
          </div>
          <div>
            <label htmlFor="line_access_token" className="label">チャネルアクセストークン（長期）</label>
            <textarea id="line_access_token" name="line_access_token" rows={3} autoComplete="off" required={!connected} className="input font-mono text-sm" placeholder={connected ? "設定済み（変更する場合のみ入力）" : ""} />
          </div>
          <div>
            <label htmlFor="liff_id" className="label">LIFF ID</label>
            <input id="liff_id" name="liff_id" autoComplete="off" defaultValue={salon.liff_id ?? ""} className="input font-mono" placeholder="1234567890-AbcdEfgh" />
          </div>
          <p className="text-xs text-neutral-500">シークレットとトークンは暗号化して保存し、画面には表示しません。</p>
        </ActionForm>
      </Step>

      <Step n={4} title="Webhook をオンにする">
        <p>保存すると、下の Webhook URL は自動で LINE に登録されます。最後に LINE Developers の「Messaging API設定」で <b>「Webhookの利用」をオン</b>にしてください（ブロックされたことを検知するために使います）。</p>
        <CopyField label="Webhook URL" value={webhookUrl(base, salon.id)} />
      </Step>
    </div>
  );
}
