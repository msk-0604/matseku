"use client";
import { createBrowserClient } from "@supabase/ssr";

/** ブラウザ用（写真のアップロードに使う）。RLS が効く */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
