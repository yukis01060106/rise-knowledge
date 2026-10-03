import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("proxy（未ログイン時のリダイレクト）", () => {
  it.each(["/", "/admin/users", "/onboarding", "/articles/123"])("未ログインで %s を開くとログイン画面へ送る", (path) => {
    const res = proxy(request(path));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("callbackUrl")).toBe(path);
  });

  it("未ログインで API を呼ぶと 401 を返す", () => {
    expect(proxy(request("/api/articles")).status).toBe(401);
  });

  it.each(["/login", "/api/auth/signin", "/api/auth/callback/google", "/brand/logo.png", "/icon.png"])("%s はログインなしで通す", (path) => {
    expect(proxy(request(path)).headers.get("x-middleware-next")).toBe("1");
  });

  it("/brand に似た名前のパスは公開しない", () => {
    expect(proxy(request("/brandnew")).status).toBe(307);
  });

  it("セッション Cookie があれば通す（中身の検証はサーバー側で行う）", () => {
    const res = proxy(request("/admin/users", "authjs.session-token=abc"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
