"use client";

import { startTransition, useActionState, useState } from "react";
import type { VisitFormState } from "@/app/app/(main)/visits/actions";
import { createClient } from "@/lib/supabase/client";
import { COLORS, CURLS, LENGTHS, MENU_PRESETS, SIDES, TECHNIQUES, THICKNESSES, ZONES } from "@/lib/lash";
import type { LashDesign, ZoneLengths } from "@/lib/types";

type Initial = {
  visited_at: string;
  menu: string | null;
  price: number | null;
  note: string | null;
  lash_design: LashDesign;
};

type Props = {
  action: (prev: VisitFormState, fd: FormData) => Promise<VisitFormState>;
  salonId: string;
  visitId: string;
  initial: Initial;
  existingPhotos: { id: string; url: string }[];
  submitLabel: string;
  prefillNote?: string;
};

type Upload = { key: string; previewUrl: string; path?: string; status: "uploading" | "done" | "error" };

const MAX_EDGE = 1600;

/** 長辺1600pxのJPEGに縮小（通信量とストレージを節約） */
async function compress(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (blob) return blob;
  } catch {
    // 縮小できない形式はそのまま送る
  }
  return file;
}

const emptyZone: ZoneLengths = { inner: null, center: null, outer: null };

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-sm text-red-600">{msg}</p> : null;
}

export function VisitForm({ action, salonId, visitId, initial, existingPhotos, submitLabel, prefillNote }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const fe = state.fieldErrors ?? {};
  const d = initial.lash_design ?? {};

  const [lengths, setLengths] = useState<{ left: ZoneLengths; right: ZoneLengths }>({
    left: d.length?.left ?? emptyZone,
    right: d.length?.right ?? emptyZone,
  });
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const uploading = uploads.some((u) => u.status === "uploading");

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const supabase = createClient();
    const items = Array.from(files).map((file) => ({
      file,
      key: crypto.randomUUID(),
      previewUrl: URL.createObjectURL(file),
    }));
    setUploads((prev) => [...prev, ...items.map(({ key, previewUrl }) => ({ key, previewUrl, status: "uploading" as const }))]);

    await Promise.all(
      items.map(async ({ file, key }) => {
        const blob = await compress(file);
        const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        const path = `${salonId}/${visitId}/${key}.${ext}`;
        const { error } = await supabase.storage
          .from("visit-photos")
          .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
        setUploads((prev) =>
          prev.map((u) => (u.key === key ? { ...u, path, status: error ? "error" : "done" } : u)),
        );
      }),
    );
  }

  async function removeUpload(u: Upload) {
    setUploads((prev) => prev.filter((x) => x.key !== u.key));
    if (u.path && u.status === "done") {
      await createClient().storage.from("visit-photos").remove([u.path]);
    }
  }

  function setLen(side: "left" | "right", zone: keyof ZoneLengths, value: string) {
    setLengths((prev) => ({ ...prev, [side]: { ...prev[side], [zone]: value === "" ? null : Number(value) } }));
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <section className="card space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="visited_at" className="label">来店日 <span className="text-red-600">*</span></label>
            <input id="visited_at" name="visited_at" type="date" required defaultValue={initial.visited_at} className="input" />
            <FieldError msg={fe.visited_at} />
          </div>
          <div>
            <label htmlFor="price" className="label">金額（円）</label>
            <input id="price" name="price" inputMode="numeric" defaultValue={initial.price ?? ""} className="input" placeholder="6000" />
            <FieldError msg={fe.price} />
          </div>
        </div>
        <div>
          <label htmlFor="menu" className="label">メニュー</label>
          <input id="menu" name="menu" list="menu-presets" defaultValue={initial.menu ?? ""} className="input" placeholder="付け放題" />
          <datalist id="menu-presets">
            {MENU_PRESETS.map((m) => <option key={m} value={m} />)}
          </datalist>
          <FieldError msg={fe.menu} />
        </div>
      </section>

      <section className="card space-y-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold">マツエク設計</h2>
          {prefillNote && <span className="text-xs text-neutral-500">{prefillNote}</span>}
        </div>

        <fieldset>
          <legend className="label">施術メニュー</legend>
          <div className="flex flex-wrap gap-2">
            {TECHNIQUES.map((t) => (
              <label key={t} className="chip cursor-pointer border border-neutral-300 px-3 py-1.5 text-sm has-checked:border-brand-600 has-checked:bg-brand-600 has-checked:text-white">
                <input type="radio" name="ld_technique" value={t} defaultChecked={d.technique === t} className="sr-only" />
                {t}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">長さ（mm）</legend>
          <table className="w-full table-fixed text-center text-sm">
            <thead>
              <tr className="text-neutral-500">
                <th className="w-10" />
                {ZONES.map((z) => <th key={z.key} className="pb-1 font-medium">{z.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {SIDES.map((s) => (
                <tr key={s.key}>
                  <th className="font-medium text-neutral-500">{s.label}</th>
                  {ZONES.map((z) => (
                    <td key={z.key} className="p-1">
                      <select
                        name={`ld_len_${s.key}_${z.key}`}
                        aria-label={`${s.label} ${z.label}`}
                        value={lengths[s.key][z.key] ?? ""}
                        onChange={(e) => setLen(s.key, z.key, e.target.value)}
                        className="input px-1 text-center"
                      >
                        <option value="">—</option>
                        {LENGTHS.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() => setLengths((p) => ({ ...p, right: { ...p.left } }))}
            className="mt-1 text-sm text-brand-600"
          >
            右を左と同じにする
          </button>
        </fieldset>

        <fieldset>
          <legend className="label">カール（複数可）</legend>
          <div className="flex flex-wrap gap-2">
            {CURLS.map((c) => (
              <label key={c} className="chip min-w-11 cursor-pointer justify-center border border-neutral-300 px-3 py-1.5 text-sm has-checked:border-brand-600 has-checked:bg-brand-600 has-checked:text-white">
                <input type="checkbox" name="ld_curl" value={c} defaultChecked={d.curl?.includes(c)} className="sr-only" />
                {c}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ld_thickness" className="label">太さ（mm）</label>
            <select id="ld_thickness" name="ld_thickness" defaultValue={d.thickness ?? ""} className="input">
              <option value="">—</option>
              {THICKNESSES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ld_count" className="label">本数</label>
            <input id="ld_count" name="ld_count" inputMode="numeric" defaultValue={d.count ?? ""} className="input" placeholder="120" />
          </div>
          <div>
            <label htmlFor="ld_color" className="label">カラー</label>
            <select id="ld_color" name="ld_color" defaultValue={d.color ?? ""} className="input">
              <option value="">—</option>
              {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ld_glue" className="label">グルー</label>
            <input id="ld_glue" name="ld_glue" defaultValue={d.glue ?? ""} className="input" placeholder="速乾タイプ" />
          </div>
        </div>

        <div>
          <label htmlFor="ld_next_note" className="label">次回への申し送り</label>
          <textarea id="ld_next_note" name="ld_next_note" rows={2} defaultValue={d.next_note ?? ""} className="input" placeholder="例：目尻をもう少し長めに希望" />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">写真</h2>
        <div className="grid grid-cols-3 gap-2">
          {existingPhotos
            .filter((p) => !removed.includes(p.id))
            .map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="施術写真" className="size-full object-cover" />
                <button type="button" onClick={() => setRemoved((r) => [...r, p.id])} className="absolute top-1 right-1 rounded-full bg-black/60 px-2 text-sm text-white" aria-label="写真を削除">×</button>
              </div>
            ))}
          {uploads.map((u) => (
            <div key={u.key} className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.previewUrl} alt="追加する写真" className={`size-full object-cover ${u.status === "uploading" ? "opacity-40" : ""}`} />
              {u.status === "uploading" && <span className="absolute inset-0 flex items-center justify-center text-xs">送信中…</span>}
              {u.status === "error" && <span className="absolute inset-x-0 bottom-0 bg-red-600 text-center text-xs text-white">失敗</span>}
              <button type="button" onClick={() => removeUpload(u)} className="absolute top-1 right-1 rounded-full bg-black/60 px-2 text-sm text-white" aria-label="写真を取り消す">×</button>
            </div>
          ))}
          <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 text-sm text-neutral-500">
            <span className="text-2xl">＋</span>
            写真を追加
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        {uploads.filter((u) => u.status === "done" && u.path).map((u) => (
          <input key={u.key} type="hidden" name="photo_path" value={u.path} />
        ))}
        {removed.map((id) => <input key={id} type="hidden" name="remove_photo_id" value={id} />)}
      </section>

      <section className="card">
        <label htmlFor="note" className="label">メモ</label>
        <textarea id="note" name="note" rows={3} defaultValue={initial.note ?? ""} className="input" placeholder="当日の様子など" />
        <FieldError msg={fe.note} />
      </section>

      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button type="submit" disabled={pending || uploading} className="btn-primary sticky bottom-4 w-full shadow-lg">
        {uploading ? "写真を送信中…" : pending ? "保存中…" : submitLabel}
      </button>
    </form>
  );
}
