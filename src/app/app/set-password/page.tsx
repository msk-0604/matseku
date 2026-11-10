import type { Metadata } from "next";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "パスワードの設定" };

export default function SetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">パスワードの設定</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-600">次回からこのパスワードでログインします（8文字以上）</p>
      <SetPasswordForm />
    </main>
  );
}
