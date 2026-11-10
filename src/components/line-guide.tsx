import QRCode from "qrcode";
import type { Salon } from "@/lib/types";
import { oaMessageUrl } from "@/lib/line";
import { ActionForm } from "@/components/action-form";
import { AutoRefresh } from "@/components/auto-refresh";
import { saveLineSettings } from "@/app/app/(main)/settings/actions";

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-neutral-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="w-full" loading="lazy" />
      <span className="block bg-neutral-50 py-1 text-center text-xs text-neutral-500">タップで拡大</span>
    </a>
  );
}

function Num({ n }: { n: number }) {
  return <span className="mr-1 inline-flex size-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">{n}</span>;
}

/** LINE接続：トークンとシークレットを貼るだけ */
export function LineConnectGuide({ salon }: { salon: Salon }) {
  const connected = Boolean(salon.line_connected_at);
  return (
    <div className="space-y-5 text-sm leading-relaxed">
      <div className="space-y-2">
        <h3 className="font-bold">① チャネルシークレットをコピー</h3>
        <p>
          パソコンで <a href="https://manager.line.biz/" target="_blank" rel="noreferrer" className="text-brand-600 underline">LINE Official Account Manager</a> を開き、
          <b>設定 → Messaging API</b> へ。まだなら「Messaging APIを利用する」を押します（プロバイダーは新規作成でOK）。表示された <b>Channel secret</b> をコピーします。
        </p>
        <Shot src="/guide/messaging-api.svg" alt="Messaging API の画面イメージ" />
      </div>

      <div className="space-y-2">
        <h3 className="font-bold">② チャネルアクセストークンをコピー</h3>
        <p>
          <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" className="text-brand-600 underline">LINE Developers</a> にログインし、
          さきほどのプロバイダー → サロンのチャネル → <Num n={1} /><b>Messaging API設定</b> を開きます。いちばん下の
          「チャネルアクセストークン（長期）」で <Num n={2} /><b>発行</b> を押し、<Num n={3} />表示された長い文字列をコピーします。
        </p>
        <Shot src="/guide/access-token.svg" alt="チャネルアクセストークンの画面イメージ" />
      </div>

      <div className="space-y-2">
        <h3 className="font-bold">③ 2つを貼り付けて保存</h3>
        <ActionForm action={saveLineSettings} submitLabel={connected ? "更新して接続を確認" : "保存して接続を確認"} pendingLabel="接続を確認中…">
          <div>
            <label htmlFor="line_channel_secret" className="label">チャネルシークレット（Channel secret）</label>
            <input id="line_channel_secret" name="line_channel_secret" autoComplete="off" required={!connected} className="input font-mono" placeholder={connected ? "設定済み（変更する場合のみ入力）" : "32文字の英数字"} />
          </div>
          <div>
            <label htmlFor="line_access_token" className="label">チャネルアクセストークン（長期）</label>
            <textarea id="line_access_token" name="line_access_token" rows={3} autoComplete="off" required={!connected} className="input font-mono text-sm" placeholder={connected ? "設定済み（変更する場合のみ入力）" : "長い文字列をそのまま貼り付け"} />
          </div>
          <p className="text-xs text-neutral-500">どちらも暗号化して保存し、画面には表示しません。</p>
        </ActionForm>
      </div>
    </div>
  );
}

/** LINEの応答設定：Webhook オン・応答メッセージ オフ（画像つき）＋ 確認コードで動作確認 */
export async function LineResponseGuide({ salon }: { salon: Salon }) {
  const verified = Boolean(salon.line_webhook_verified_at);
  const testText = salon.line_test_code ? `確認コード ${salon.line_test_code}` : null;
  const testUrl = testText && salon.line_basic_id ? oaMessageUrl(salon.line_basic_id, testText) : null;
  const qr = testUrl ? await QRCode.toString(testUrl, { type: "svg", margin: 1 }) : null;

  return (
    <div className="space-y-5 text-sm leading-relaxed">
      <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
        <b>ここがいちばん大事な設定です。</b>
        <br />
        「Webhook」がオフだと、お客さまのLINE連携ができません。「応答メッセージ」がオンだと、LINEの自動返信がお客さまに二重に届きます。
      </div>

      <div className="space-y-2">
        <h3 className="font-bold">パソコンの場合</h3>
        <p>
          <a href="https://manager.line.biz/" target="_blank" rel="noreferrer" className="text-brand-600 underline">LINE Official Account Manager</a> で
          <Num n={1} /><b>設定</b> → <Num n={2} /><b>応答設定</b> を開き、
          <Num n={3} /><b className="text-green-700">Webhook をオン</b>、<Num n={4} /><b className="text-red-700">応答メッセージをオフ</b> にします。
        </p>
        <Shot src="/guide/response-settings-pc.svg" alt="応答設定（パソコン）の画面イメージ" />
      </div>

      <details className="rounded-lg border border-neutral-200 p-3">
        <summary className="cursor-pointer font-bold">スマホ（LINE公式アカウントアプリ）の場合</summary>
        <div className="mt-2 space-y-2">
          <p>
            アプリで <Num n={1} />右上の<b>設定</b> → <Num n={2} /><b>応答設定</b> を開き、<Num n={3} /><b className="text-green-700">Webhook をオン</b>、
            <Num n={4} /><b className="text-red-700">応答メッセージをオフ</b> にします。
          </p>
          <Shot src="/guide/response-settings-app.svg" alt="応答設定（アプリ）の画面イメージ" />
        </div>
      </details>

      <p className="text-xs text-neutral-500">「チャット」と「あいさつメッセージ」はどちらでも大丈夫です。チャットをオンにすると、お客さまとのやりとりもこれまでどおりできます。</p>

      <div className={`space-y-3 rounded-xl border-2 p-4 ${verified ? "border-green-400 bg-green-50" : "border-brand-200 bg-brand-50"}`}>
        <h3 className="font-bold">設定できたか確認する</h3>
        {verified ? (
          <p className="font-bold text-green-800">✓ 確認できました。Webhook はオンになっています。</p>
        ) : !testUrl ? (
          <p>先に「LINE公式アカウントの接続」を済ませてください。</p>
        ) : (
          <>
            <AutoRefresh seconds={4} />
            <p>
              <b>ご自身のLINE</b>から、サロンの公式アカウントに次の確認コードを送ってください。届くと、この画面が自動で「確認できました」に変わります。
            </p>
            <p className="rounded-lg bg-white p-3 text-center font-mono text-lg font-bold tracking-wider">{testText}</p>
            <a href={testUrl} className="btn-primary w-full bg-[#06C755]">スマホならここを押してLINEで送信</a>
            {qr && (
              <div className="text-center">
                <p className="mb-1 text-xs text-neutral-600">パソコンで見ている場合は、スマホのカメラで読み取ってください</p>
                <div className="mx-auto w-40" dangerouslySetInnerHTML={{ __html: qr }} />
              </div>
            )}
          </>
        )}
        <ul className="space-y-1 text-xs text-neutral-700">
          <li>・返信が<b>1通だけ</b>届けばOKです。</li>
          <li>・返信のあとに<b>別の自動返信</b>も届いたら、「応答メッセージ」がオンのままです。オフにしてください。</li>
          <li>・何も返ってこない／画面が変わらない場合は、「Webhook」がオフのままか、「Webhookの利用」がオフです（LINE Developers の Messaging API設定 にもあります）。</li>
        </ul>
      </div>
    </div>
  );
}
