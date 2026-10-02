import { NextResponse, type NextRequest } from "next/server";

/** ログインなしで開けるパス（それ以外はすべてログイン必須） */
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/dev-login"];

export const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * 未ログインのリクエストをログイン画面へ送る。
 * ここではセッション Cookie の有無だけを見る。セッションが有効か・権限があるかは
 * かならずサーバー側（requireUser / requireAdmin）で確認する。
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
