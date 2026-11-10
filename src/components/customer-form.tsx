"use client";

import { startTransition, useActionState, useState } from "react";
import type { CustomerFormState } from "@/app/app/(main)/customers/actions";
import type { Customer } from "@/lib/types";
import { formatPhone } from "@/lib/text";

type Props = {
  action: (prev: CustomerFormState, fd: FormData) => Promise<CustomerFormState>;
  customer?: Customer;
  defaultRepairDays: number;
  submitLabel: string;
};

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-sm text-red-600">{msg}</p> : null;
}

export function CustomerForm({ action, customer, defaultRepairDays, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const [consent, setConsent] = useState(customer?.sensitive_consent ?? false);
  const fe = state.fieldErrors ?? {};

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        // form の action に直接渡すと、エラー時に入力内容がリセットされるため手動で送信する
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <section className="card space-y-4">
        <div>
          <label htmlFor="name" className="label">お名前 <span className="text-red-600">*</span></label>
          <input id="name" name="name" required defaultValue={customer?.name} autoComplete="off" className="input" placeholder="山田 花子" />
          <FieldError msg={fe.name} />
        </div>
        <div>
          <label htmlFor="name_kana" className="label">ふりがな <span className="text-red-600">*</span></label>
          <input id="name_kana" name="name_kana" required defaultValue={customer?.name_kana} autoComplete="off" className="input" placeholder="やまだ はなこ" />
          <FieldError msg={fe.name_kana} />
        </div>
        <div>
          <label htmlFor="phone" className="label">電話番号</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={formatPhone(customer?.phone)} className="input" placeholder="090-1234-5678" />
          <FieldError msg={fe.phone} />
        </div>
        <div>
          <label htmlFor="birthday" className="label">誕生日</label>
          <input id="birthday" name="birthday" type="date" defaultValue={customer?.birthday ?? ""} className="input" />
          <FieldError msg={fe.birthday} />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">アレルギー・注意事項</h2>
        <label className="flex items-start gap-3 rounded-lg bg-amber-50 p-3">
          <input
            type="checkbox"
            name="sensitive_consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 size-5 accent-brand-600"
          />
          <span className="text-sm leading-relaxed">
            <b>本人同意あり</b>
            <br />
            アレルギーや病歴などの要配慮情報を記録することについて、お客さまご本人の同意を得ました
          </span>
        </label>
        <div>
          <label htmlFor="allergy_note" className="label">アレルギー・病歴・注意事項</label>
          <textarea
            id="allergy_note"
            name="allergy_note"
            rows={3}
            disabled={!consent}
            defaultValue={customer?.allergy_note ?? ""}
            className="input"
            placeholder={consent ? "例：グルーで目がしみやすい／花粉症" : "本人同意にチェックすると入力できます"}
          />
          {!consent && customer?.allergy_note && (
            <p className="mt-1 text-sm text-red-600">同意を外して保存すると、記録済みの内容は削除されます</p>
          )}
          <FieldError msg={fe.allergy_note} />
        </div>
        <div>
          <label htmlFor="patch_test_on" className="label">パッチテスト実施日</label>
          <input id="patch_test_on" name="patch_test_on" type="date" defaultValue={customer?.patch_test_on ?? ""} className="input" />
          <FieldError msg={fe.patch_test_on} />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">リペア案内</h2>
        <div>
          <label htmlFor="repair_days" className="label">リペア日数（このお客さまだけ変える場合）</label>
          <div className="flex items-center gap-2">
            <input id="repair_days" name="repair_days" inputMode="numeric" defaultValue={customer?.repair_days ?? ""} className="input w-28" placeholder={String(defaultRepairDays)} />
            <span className="text-sm text-neutral-600">日（空欄ならサロンの初期値 {defaultRepairDays}日）</span>
          </div>
          <FieldError msg={fe.repair_days} />
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" name="notify_opt_out" defaultChecked={customer?.notify_opt_out ?? false} className="size-5 accent-brand-600" />
          <span className="text-sm">LINEでの自動案内を送らない</span>
        </label>
      </section>

      <section className="card">
        <label htmlFor="memo" className="label">メモ</label>
        <textarea id="memo" name="memo" rows={3} defaultValue={customer?.memo ?? ""} className="input" placeholder="好み・会話のメモなど" />
        <FieldError msg={fe.memo} />
      </section>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "保存中…" : submitLabel}
      </button>
    </form>
  );
}
