const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日本時間の今日（YYYY-MM-DD） */
export function todayJst(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

export function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** b - a の日数 */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86_400_000);
}

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** 2026-03-05 → 3/5(木) 。年が今年と違えば 2025/3/5(木) */
export function formatDate(ymd: string | null | undefined, today?: string): string {
  if (!ymd) return "";
  const d = parseYmd(ymd);
  const y = d.getUTCFullYear();
  const md = `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEK[d.getUTCDay()]})`;
  if (today && today.slice(0, 4) === String(y)) return md;
  return `${y}/${md}`;
}

/** 2026-03-05 → 2026年3月5日 */
export function formatDateLong(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const d = parseYmd(ymd);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

/** ISO日時 → 日本時間の YYYY-MM-DD */
export function jstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO日時 → 日本時間の HH:MM */
export function jstTime(iso: string): string {
  return new Date(new Date(iso).getTime() + JST_OFFSET_MS).toISOString().slice(11, 16);
}

/** 日本時間の日付と時刻 → ISO（UTC） */
export function jstToIso(ymd: string, hhmm: string): string {
  return new Date(`${ymd}T${hhmm}:00+09:00`).toISOString();
}

/** 11/20(金) 14:00〜15:30 */
export function formatSlot(startsAt: string, endsAt: string, today?: string): string {
  return `${formatDate(jstDate(startsAt), today)} ${jstTime(startsAt)}〜${jstTime(endsAt)}`;
}

/** その日を含む週の月曜日（YYYY-MM-DD） */
export function mondayOf(ymd: string): string {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0=日
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

/** ISO日時がもう過ぎているか */
export function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}
