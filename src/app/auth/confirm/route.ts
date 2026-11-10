import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const ALLOWED: EmailOtpType[] = ["invite", "recovery", "signup", "email"];

/** メールのリンクから来たときにログイン状態にして、パスワード設定画面などへ移動する */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const tokenHash = sp.get("token_hash");
  const type = sp.get("type") as EmailOtpType | null;
  const nextParam = sp.get("next") ?? "/app/customers";
  const next = nextParam.startsWith("/app/") ? nextParam : "/app/customers";

  // パスワード再設定メール（PKCE）から来た場合
  const code = sp.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  if (tokenHash && type && ALLOWED.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/app/login?error=link", request.url));
}
