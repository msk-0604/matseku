import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** リクエストごとにセッションを更新し、未ログインなら /app/login へ */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;
  const isLoginPage = path === "/app/login";

  if (!isLoggedIn && !isLoginPage) {
    const to = request.nextUrl.clone();
    to.pathname = "/app/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  if (isLoggedIn && isLoginPage) {
    const to = request.nextUrl.clone();
    to.pathname = "/app/customers";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}
