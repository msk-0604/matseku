"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ForgotState } from "../actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState<ForgotState, FormData>(requestPasswordReset, {});
  if (state.sent) {
    return <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800">メールを送りました。届いたメールのリンクから新しいパスワードを設定してください。</p>;
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="label">メールアドレス</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full">{pending ? "送信中…" : "再設定メールを送る"}</button>
    </form>
  );
}
