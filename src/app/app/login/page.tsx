import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">リペアコール</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-600">サロンのアカウントでログインしてください</p>
      <LoginForm />
      <Link href="/app/forgot" className="mt-6 text-center text-sm text-neutral-500 underline-offset-2 hover:underline">
        パスワードを忘れた場合
      </Link>
      <p className="mt-8 text-center text-sm text-neutral-600">
        まだお申し込みでない方は <Link href="/#pricing" className="text-brand-600 underline">14日間 無料で試す</Link>
      </p>
    </main>
  );
}
