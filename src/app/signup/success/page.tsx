import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "お申し込みありがとうございます" };

export default function SignupSuccessPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6 py-12 text-center">
      <p className="text-4xl">✉️</p>
      <h1 className="text-2xl font-bold">お申し込みありがとうございます</h1>
      <p className="leading-relaxed text-neutral-700">
        ご登録のメールアドレスに「パスワードの設定」のご案内を送りました。メールのボタンからパスワードを設定して、初期設定に進んでください。
      </p>
      <p className="text-sm text-neutral-500">数分たってもメールが届かない場合は、迷惑メールフォルダもご確認ください。</p>
      <Link href="/app/login" className="btn-secondary">ログイン画面へ</Link>
    </main>
  );
}
