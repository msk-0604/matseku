import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireSalon } from "@/lib/auth";
import { isPast } from "@/lib/date";
import { liffUrl } from "@/lib/line";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageLoading } from "@/components/loading";
import { createLinkToken } from "../../actions";

export const metadata: Metadata = { title: "LINE連携QR" };

export default function LinkPage({ params, searchParams }: PageProps<"/app/customers/[id]/link">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <LinkQr params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function LinkQr({
  params,
  searchParams,
}: {
  params: PageProps<"/app/customers/[id]/link">["params"];
  searchParams: PageProps<"/app/customers/[id]/link">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const token = typeof sp.t === "string" ? sp.t : null;
  const { supabase, salon } = await requireSalon();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, line_user_id, line_blocked")
    .eq("id", id)
    .maybeSingle();
  if (!customer) notFound();

  const back = (
    <Link href={`/app/customers/${id}`} className="text-sm text-neutral-500">← {customer.name}さんのカルテ</Link>
  );

  if (!salon.liff_id || !salon.line_connected_at) {
    return (
      <div className="space-y-4">
        {back}
        <div className="card space-y-3 text-sm">
          <p className="font-bold">LINEの設定がまだ終わっていません</p>
          <p>お客さまとLINEで連携するには、先にサロンのLINE公式アカウントを接続してください。</p>
          <Link href="/app/settings/line" className="btn-primary w-full">LINEを接続する</Link>
        </div>
      </div>
    );
  }

  const { data: link } = token
    ? await supabase
        .from("link_tokens")
        .select("token, expires_at, used_at")
        .eq("customer_id", id)
        .eq("token", token)
        .maybeSingle()
    : { data: null };

  if (link?.used_at || (customer.line_user_id && !link)) {
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-xl border border-green-300 bg-green-50 p-6 text-center">
          <p className="text-3xl">✓</p>
          <p className="mt-2 font-bold text-green-800">{customer.name}さんとLINE連携できました</p>
          <p className="mt-1 text-sm text-green-800">リペア時期になると、LINEで自動で案内が届きます。</p>
        </div>
        <Link href={`/app/customers/${id}`} className="btn-secondary w-full">カルテに戻る</Link>
      </div>
    );
  }

  const valid = link && !isPast(link.expires_at);
  if (!valid) {
    return (
      <div className="space-y-4">
        {back}
        <div className="card space-y-3 text-center text-sm">
          <p>{link ? "QRの有効期限が切れました。" : "LINE連携用のQRを表示します。"}</p>
          <form action={createLinkToken.bind(null, id)}>
            <button className="btn-primary w-full">QRを表示する</button>
          </form>
        </div>
      </div>
    );
  }

  const url = liffUrl(salon.liff_id, "/link", { t: link.token });
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return (
    <div className="space-y-4">
      {back}
      <AutoRefresh seconds={3} />
      <div className="card text-center">
        <h1 className="text-lg font-bold">{customer.name}さん専用 LINE連携QR</h1>
        <p className="mt-1 text-sm text-neutral-600">お客さまのスマホのカメラで読み取ってもらい、「登録する」を押してもらってください。</p>
        <div className="mx-auto mt-4 w-64 max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-3 text-xs text-neutral-500">
          有効期限：{new Date(link.expires_at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })}まで（1回だけ使えます）
        </p>
        <p className="mt-1 text-xs text-neutral-400">登録が終わると、この画面は自動で切り替わります</p>
      </div>
      {customer.line_user_id && (
        <p className="text-center text-xs text-neutral-500">※ このお客さまは連携済みです。読み取ると連携先のLINEが置き換わります。</p>
      )}
      <Link href={`/app/customers/${id}`} className="btn-secondary w-full">あとで（カルテに戻る）</Link>
    </div>
  );
}
