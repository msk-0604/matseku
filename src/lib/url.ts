import "server-only";
import { headers } from "next/headers";

/**
 * このアプリの公開URL（例：https://xxx.vercel.app）。
 * APP_URL があればそれを使い、なければ今アクセスしているURLから組み立てる。
 */
export async function getBaseUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function webhookUrl(base: string, salonId: string): string {
  return `${base}/api/line/webhook/${salonId}`;
}
