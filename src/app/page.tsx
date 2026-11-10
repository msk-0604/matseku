import { Suspense } from "react";
import Link from "next/link";
import { PricingForm } from "./pricing-form";

const FEATURES = [
  ["リペア時期に自動でLINE", "前回の来店から約3週間たったお客さまに、サロンのLINE公式アカウントから自動で案内を送ります。"],
  ["LINEの中で予約まで完結", "案内のボタンから空き枠を選ぶだけ。お客さまはアプリのインストールも会員登録も不要です。"],
  ["カルテもスマホで", "アレルギー、マツエク設計（長さ・カール・太さ・本数）、施術写真をまとめて記録できます。"],
  ["成果が数字でわかる", "案内から戻ったお客さまの人数と売上を、毎月のレポートで確認できます。"],
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-md px-6 pb-16">
      <section className="py-12">
        <p className="text-sm font-semibold text-brand-600">マツエクサロン向け</p>
        <h1 className="mt-1 text-3xl leading-tight font-bold">
          新規のお客さまを、
          <br />
          サロンのLINEでリピーターに。
        </h1>
        <p className="mt-4 leading-relaxed text-neutral-700">
          ホットペッパーなどで来た新規のお客さまに、リペア時期になったら自動でLINEをお送りします。予約はLINEの中で完結します。
        </p>
        <div className="mt-6 flex gap-3">
          <a href="#pricing" className="btn-primary flex-1">無料で試す</a>
          <Link href="/app/login" className="btn-secondary flex-1">ログイン</Link>
        </div>
      </section>

      <section className="space-y-3">
        {FEATURES.map(([title, body]) => (
          <div key={title} className="card">
            <h2 className="font-bold">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-neutral-700">{body}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="scroll-mt-4 pt-12">
        <h2 className="mb-1 text-xl font-bold">料金</h2>
        <p className="mb-4 text-sm text-neutral-600">14日間の無料体験つき。いつでも解約できます。</p>
        <Suspense>
          <PricingForm />
        </Suspense>
      </section>
    </main>
  );
}
