"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/url";

export type LoginState = { error?: string; email?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "メールアドレスとパスワードを入力してください", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "メールアドレスまたはパスワードが違います", email };
  }
  redirect("/app/customers");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/app/login");
}

export type PasswordState = { error?: string };

export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "パスワードは8文字以上にしてください" };
  if (password !== confirm) return { error: "確認用のパスワードが一致しません" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: `設定できませんでした（${error.message}）` };
  redirect("/app/setup");
}

export type ForgotState = { error?: string; sent?: boolean };

export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "メールアドレスを入力してください" };
  const supabase = await createClient();
  const base = await getBaseUrl();
  // 登録の有無は画面に出さない
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${base}/auth/confirm?next=/app/set-password` });
  return { sent: true };
}
