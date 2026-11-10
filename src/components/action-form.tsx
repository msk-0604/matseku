"use client";

import { startTransition, useActionState } from "react";

export type ActionState = { ok?: boolean; error?: string; message?: string };

/** 送信結果（成功メッセージ／エラー）を表示する汎用フォーム。入力内容はリセットしない */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "保存中…",
  className = "space-y-4",
  children,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {children}
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.message && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
