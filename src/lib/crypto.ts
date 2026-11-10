import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/** APP_ENCRYPTION_KEY（32バイトを base64 にしたもの）から用途別の鍵を作る */
function key(purpose: string): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY が設定されていません");
  const master = Buffer.from(raw, "base64");
  if (master.length !== 32) throw new Error("APP_ENCRYPTION_KEY は32バイトを base64 にした値にしてください");
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), `repaircall:${purpose}`, 32));
}

/** AES-256-GCM で暗号化。形式：v1.<iv>.<tag>.<暗号文>（それぞれ base64url） */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("secrets"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(stored: string): string {
  const [v, iv, tag, enc] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("暗号化データの形式が正しくありません");
  const decipher = createDecipheriv("aes-256-gcm", key("secrets"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64url")), decipher.final()]).toString("utf8");
}

/** URL に付ける改ざん防止の署名（カレンダー用ファイルなど） */
export function sign(value: string): string {
  return createHmac("sha256", key("url-sign")).update(value).digest("base64url").slice(0, 32);
}

export function verifySigned(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/** 推測できないランダムな文字列（LINE連携QRのトークン用） */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
