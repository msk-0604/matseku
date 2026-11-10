import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, simpleEmail } from "@/lib/email";

/**
 * パスワード設定用のリンクを作って案内メールを送る。
 * ユーザーがいなければ作成する（invite）。いれば再設定リンク（recovery）。
 */
export async function sendSetupEmail(email: string, baseUrl: string, salonName: string): Promise<{ userId: string }> {
  const admin = createAdminClient();
  const next = "/app/set-password";

  let res = await admin.auth.admin.generateLink({ type: "invite", email });
  let type: "invite" | "recovery" = "invite";
  if (res.error) {
    // すでに登録済みのメールアドレス
    res = await admin.auth.admin.generateLink({ type: "recovery", email });
    type = "recovery";
  }
  if (res.error || !res.data.user) throw new Error(`ユーザーを作成できませんでした: ${res.error?.message}`);

  const url = `${baseUrl}/auth/confirm?${new URLSearchParams({
    token_hash: res.data.properties.hashed_token,
    type,
    next,
  })}`;

  const { html, text } = simpleEmail(
    [
      `${salonName} さま`,
      "リペアコールにお申し込みいただき、ありがとうございます。14日間の無料体験が始まりました。",
      "下のボタンからパスワードを設定して、初期設定（LINE公式アカウントの接続など）に進んでください。",
      "※このリンクの有効期限は24時間です。期限が切れた場合はログイン画面の「パスワードを忘れた場合」から再設定できます。",
    ],
    { label: "パスワードを設定する", url },
  );
  await sendEmail({ to: email, subject: "【リペアコール】パスワードの設定をお願いします", html, text });
  return { userId: res.data.user.id };
}
