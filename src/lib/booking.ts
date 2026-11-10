export const CHANNELS = [
  { value: "phone", label: "電話", short: "電話" },
  { value: "hotpepper", label: "ホットペッパー", short: "HPB" },
  { value: "line", label: "LINE", short: "LINE" },
  { value: "other", label: "その他", short: "その他" },
] as const;

export type Channel = (typeof CHANNELS)[number]["value"];

export function channelShort(v: string): string {
  return CHANNELS.find((c) => c.value === v)?.short ?? v;
}

export const DURATIONS = [60, 90, 120, 150, 180] as const;
