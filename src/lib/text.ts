/** カタカナ→ひらがな、全角スペース→半角、前後の空白を除去 */
export function toHiragana(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, " ")
    .trim();
}

/** 電話番号を数字だけにする（全角数字も可） */
export function digitsOnly(input: string): string {
  return input.normalize("NFKC").replace(/\D/g, "");
}

/** 090-1234-5678 / 03-1234-5678 のような表示用 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = digitsOnly(phone);
  if (/^0[789]0\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

const KANA_ROWS: [string, string][] = [
  ["あ", "ぁ-お"],
  ["か", "か-ご"],
  ["さ", "さ-ぞ"],
  ["た", "た-ど"],
  ["な", "な-の"],
  ["は", "は-ぽ"],
  ["ま", "ま-も"],
  ["や", "ゃ-よ"],
  ["ら", "ら-ろ"],
  ["わ", "ゎ-ん"],
];

/** ふりがなの1文字目から「あ行」などの見出しを返す */
export function kanaRow(kana: string): string {
  const first = toHiragana(kana).charAt(0);
  for (const [label, range] of KANA_ROWS) {
    if (new RegExp(`[${range}]`).test(first)) return `${label}行`;
  }
  return "その他";
}

export function yen(price: number | null | undefined): string {
  if (price == null) return "";
  return `¥${price.toLocaleString("ja-JP")}`;
}
