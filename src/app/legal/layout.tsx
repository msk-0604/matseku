import Link from "next/link";

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" className="text-sm text-neutral-500">← リペアコール</Link>
      <article className="legal mt-4 space-y-4 text-sm leading-relaxed text-neutral-800 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ol>li]:list-decimal">
        {children}
      </article>
      <p className="mt-12 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        ※ この文面は仮のものです。公開前に【要記入】の箇所を埋め、専門家の確認を受けてください。
      </p>
    </div>
  );
}
