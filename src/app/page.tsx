import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-sm font-semibold text-brand-600">マツエクサロン向け</p>
        <h1 className="mt-1 text-3xl font-bold">リペアコール</h1>
        <p className="mt-3 leading-relaxed text-neutral-700">
          ホットペッパーで来た新規のお客さまを、サロンのLINEでリピーターに。
          リペア時期になったら自動で案内を送り、LINEの中で予約まで完結します。
        </p>
      </div>
      <Link href="/app/login" className="btn-primary">
        サロンのログイン
      </Link>
      <p className="text-xs text-neutral-500">※ 料金・お申し込みページは準備中です</p>
    </main>
  );
}
