import type { LashDesign, ZoneLengths } from "./types";

export const TECHNIQUES = ["シングル", "ボリューム", "フラット", "カラー", "ラッシュリフト", "オフのみ", "その他"] as const;
export const CURLS = ["J", "B", "C", "CC", "D", "L", "M"] as const;
export const THICKNESSES = [0.05, 0.06, 0.07, 0.1, 0.12, 0.15, 0.18, 0.2] as const;
export const COLORS = ["ブラック", "ダークブラウン", "ブラウン", "カラー（ミックス）", "その他"] as const;
export const LENGTHS = Array.from({ length: 11 }, (_, i) => 6 + i); // 6〜16mm
export const MENU_PRESETS = ["付け放題", "シングル 100本", "シングル 120本", "ボリュームラッシュ", "フラットラッシュ", "ラッシュリフト", "オフのみ"] as const;

export const ZONES = [
  { key: "inner", label: "目頭" },
  { key: "center", label: "中央" },
  { key: "outer", label: "目尻" },
] as const;
export const SIDES = [
  { key: "left", label: "左" },
  { key: "right", label: "右" },
] as const;

function num(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).normalize("NFKC").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(v: FormDataEntryValue | null, max = 500): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s.slice(0, max);
}

function clamp(n: number | null, min: number, max: number): number | null {
  if (n == null) return null;
  return n < min || n > max ? null : n;
}

/** フォームの ld_* 項目からマツエク設計を組み立てる */
export function lashDesignFromForm(fd: FormData): LashDesign {
  const zone = (side: "left" | "right"): ZoneLengths => ({
    inner: clamp(num(fd.get(`ld_len_${side}_inner`)), 3, 20),
    center: clamp(num(fd.get(`ld_len_${side}_center`)), 3, 20),
    outer: clamp(num(fd.get(`ld_len_${side}_outer`)), 3, 20),
  });
  const curls = fd
    .getAll("ld_curl")
    .map(String)
    .filter((c) => (CURLS as readonly string[]).includes(c));
  const count = num(fd.get("ld_count"));
  return {
    technique: str(fd.get("ld_technique"), 50),
    length: { left: zone("left"), right: zone("right") },
    curl: curls,
    thickness: clamp(num(fd.get("ld_thickness")), 0.01, 0.5),
    count: count == null ? null : clamp(Math.round(count), 0, 2000),
    color: str(fd.get("ld_color"), 50),
    glue: str(fd.get("ld_glue"), 100),
    next_note: str(fd.get("ld_next_note"), 1000),
  };
}

/** 一覧用の短い要約：「ボリューム / C・D / 0.07mm / 10-12mm / 400本」 */
export function summarizeLash(d: LashDesign | null | undefined): string {
  if (!d) return "";
  const parts: string[] = [];
  if (d.technique) parts.push(d.technique);
  if (d.curl?.length) parts.push(d.curl.join("・"));
  if (d.thickness) parts.push(`${d.thickness}mm`);
  const lens = [d.length?.left, d.length?.right]
    .flatMap((z) => (z ? [z.inner, z.center, z.outer] : []))
    .filter((n): n is number => typeof n === "number");
  if (lens.length) {
    const min = Math.min(...lens);
    const max = Math.max(...lens);
    parts.push(min === max ? `${min}mm` : `${min}-${max}mm`);
  }
  if (d.count) parts.push(`${d.count}本`);
  return parts.join(" / ");
}
