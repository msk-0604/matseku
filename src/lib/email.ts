import "server-only";

/**
 * Resend でメールを送る。RESEND_API_KEY が未設定ならログに出すだけ（開発用）。
 * 失敗しても呼び出し元の処理は止めない（結果を返す）。
 */
export async function sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "リペアコール <onboarding@resend.dev>";
  if (!key) {
    console.log(`[email:未送信（RESEND_API_KEY なし）] to=${input.to} subject=${input.subject}\n${input.text}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
  });
  if (!res.ok) {
    console.error(`[email] 送信失敗 ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 段落とボタン1つのシンプルなメール */
export function simpleEmail(paragraphs: string[], button?: { label: string; url: string }) {
  const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.7;color:#222;max-width:520px">
${paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("\n")}
${button ? `<p style="margin:28px 0"><a href="${escapeHtml(button.url)}" style="background:#c22f69;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(button.label)}</a></p>` : ""}
<p style="color:#888;font-size:12px">リペアコール</p></div>`;
  const text = [...paragraphs, button ? `${button.label}：${button.url}` : ""].filter(Boolean).join("\n\n");
  return { html, text };
}
