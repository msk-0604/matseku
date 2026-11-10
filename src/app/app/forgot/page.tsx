import type { Metadata } from "next";
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "パスワードを忘れた場合" };

export default function ForgotPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">パスワードの再設定</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-600">登録したメールアドレスに、再設定用のリンクを送ります</p>
      <ForgotForm />
      <Link href="/app/login" className="mt-6 text-center text-sm text-neutral-500">ログイン画面に戻る</Link>
    </main>
  );
}
