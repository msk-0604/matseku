import { formatDateLong } from "./date";

export const DEFAULT_REMINDER_TEMPLATE =
  "{名前}さま、前回のご来店から{経過日数}日が経ちました。そろそろリペアの時期です。\nご都合のよい日時をお選びください。";

export const TEMPLATE_TAGS = ["{名前}", "{サロン名}", "{前回来店日}", "{経過日数}"] as const;

export function renderTemplate(
  template: string | null | undefined,
  v: { name: string; salonName: string; visitedAt: string; days: number },
): string {
  return (template?.trim() || DEFAULT_REMINDER_TEMPLATE)
    .replaceAll("{名前}", v.name)
    .replaceAll("{サロン名}", v.salonName)
    .replaceAll("{前回来店日}", formatDateLong(v.visitedAt))
    .replaceAll("{経過日数}", String(v.days))
    .slice(0, 1000);
}

/** リペア案内の Flex Message */
export function reminderFlex(v: { salonName: string; text: string; visitedAt: string; bookUrl: string }) {
  return {
    type: "flex",
    altText: `${v.salonName}よりリペア時期のお知らせ`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: v.salonName, weight: "bold", size: "lg", wrap: true, color: "#c22f69" },
          { type: "text", text: v.text, wrap: true, size: "sm", color: "#333333" },
          {
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              { type: "text", text: "前回のご来店", size: "xs", color: "#888888", flex: 0 },
              { type: "text", text: formatDateLong(v.visitedAt), size: "xs", color: "#333333" },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#c22f69",
            action: { type: "uri", label: "空き枠を見て予約する", uri: v.bookUrl },
          },
        ],
      },
    },
  };
}
