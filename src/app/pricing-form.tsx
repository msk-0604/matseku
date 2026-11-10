"use client";

import { startTransition, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { startCheckout, type CheckoutState } from "./signup/actions";

export function PricingForm() {
  const sp = useSearchParams();
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, {});
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["monthly", "月額", "7,480円", "/月（税込）"],
            ["yearly", "年額", "74,800円", "/年（税込）2か月分お得"],
          ] as const
        ).map(([value, label, price, note]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-xl border-2 p-3 text-center ${plan === value ? "border-brand-600 bg-brand-50" : "border-neutral-200 bg-white"}`}
          >
            <input type="radio" name="plan" value={value} checked={plan === value} onChange={() => setPlan(value)} className="sr-only" />
            <div className="text-sm font-semibold text-neutral-600">{label}</div>
            <div className="text-2xl font-bold">{price}</div>
            <div className="text-xs text-neutral-500">{note}</div>
          </label>
        ))}
      </div>
      <div>
        <label htmlFor="ref" className="label">紹介コード（お持ちの方）</label>
        <input id="ref" name="ref" defaultValue={sp.get("ref") ?? ""} autoCapitalize="characters" className="input font-mono uppercase" placeholder="例：A1B2C3D4" />
        <p className="mt-1 text-xs text-neutral-500">紹介コードがあると、最初の1か月分（7,480円）が割引になります</p>
      </div>
      {(["utm_source", "utm_medium", "utm_campaign"] as const).map((k) => (
        <input key={k} type="hidden" name={k} value={sp.get(k) ?? ""} />
      ))}
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button disabled={pending} className="btn-primary w-full text-lg">
        {pending ? "お申し込みページを開いています…" : "14日間 無料で試す"}
      </button>
      <p className="text-center text-xs leading-relaxed text-neutral-500">
        お申し込みにはカードの登録が必要です。無料期間中に解約すれば料金はかかりません。
        無料期間が終わると自動で有料プランに切り替わります。
      </p>
    </form>
  );
}
