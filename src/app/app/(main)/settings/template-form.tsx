"use client";

import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { DEFAULT_REMINDER_TEMPLATE, TEMPLATE_TAGS, renderTemplate } from "@/lib/reminder";
import { saveReminderTemplate } from "./actions";

export function TemplateForm({ initial, salonName }: { initial: string | null; salonName: string }) {
  const [value, setValue] = useState(initial ?? "");
  const preview = renderTemplate(value, { name: "山田 花子", salonName, visitedAt: "2026-10-20", days: 22 });
  return (
    <ActionForm action={saveReminderTemplate} submitLabel="保存する">
      <div>
        <label htmlFor="reminder_template" className="label">案内文（空欄なら初期の文面）</label>
        <textarea
          id="reminder_template"
          name="reminder_template"
          rows={4}
          maxLength={300}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={DEFAULT_REMINDER_TEMPLATE}
          className="input text-sm"
        />
        <p className="mt-1 text-xs text-neutral-500">
          差し込み：{TEMPLATE_TAGS.map((t) => (
            <button key={t} type="button" className="mr-1 rounded bg-neutral-100 px-1 font-mono" onClick={() => setValue((v) => v + t)}>{t}</button>
          ))}
        </p>
      </div>
      <div>
        <div className="label">プレビュー</div>
        <div className="rounded-xl border border-neutral-200 bg-[#8cabd9]/20 p-3">
          <div className="rounded-xl bg-white p-3 text-sm shadow-sm">
            <div className="font-bold text-brand-600">{salonName}</div>
            <p className="mt-1 whitespace-pre-wrap text-neutral-800">{preview}</p>
            <div className="mt-2 text-xs text-neutral-500">前回のご来店　2026年10月20日</div>
            <div className="mt-3 rounded-md bg-brand-600 py-2 text-center text-sm font-semibold text-white">空き枠を見て予約する</div>
          </div>
        </div>
      </div>
    </ActionForm>
  );
}
