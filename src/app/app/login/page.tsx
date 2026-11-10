import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "ログイン" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">リペアコール</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-600">サロンのアカウントでログインしてください</p>
      <LoginForm />
    </main>
  );
}
