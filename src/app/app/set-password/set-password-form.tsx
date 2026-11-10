"use client";

import { useActionState } from "react";
import { setPassword, type PasswordState } from "../actions";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="password" className="label">新しいパスワード</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      <div>
        <label htmlFor="confirm" className="label">もう一度入力</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full">{pending ? "設定中…" : "設定して次へ"}</button>
    </form>
  );
}
