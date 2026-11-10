import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 非公開バケットの写真に1時間有効のURLを付ける */
export async function signedPhotoUrls(
  supabase: SupabaseClient,
  photos: { id: string; storage_path: string }[],
): Promise<{ id: string; url: string }[]> {
  if (!photos.length) return [];
  const { data } = await supabase.storage
    .from("visit-photos")
    .createSignedUrls(photos.map((p) => p.storage_path), 60 * 60);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return photos.flatMap((p) => {
    const url = byPath.get(p.storage_path);
    return url ? [{ id: p.id, url }] : [];
  });
}
