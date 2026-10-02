import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/dev-login/route";
import { prisma } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { createUser, resetDb } from "../helpers/db";

function post(data: Record<string, string>, origin = "http://localhost:3000") {
  const body = new URLSearchParams(data);
  return new NextRequest("http://localhost:3000/api/dev-login", {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", origin },
  });
}

beforeEach(async () => {
  await resetDb();
  process.env.AUTH_DEV_LOGIN = "true";
  resetEnvCache();
});

afterEach(() => {
  delete process.env.AUTH_DEV_LOGIN;
  resetEnvCache();
});

describe("開発用ログイン", () => {
  it("AUTH_DEV_LOGIN が無効なら 404", async () => {
    process.env.AUTH_DEV_LOGIN = "false";
    resetEnvCache();
    const res = await POST(post({ email: "taro@risetech.example", name: "太郎" }));
    expect(res.status).toBe(404);
    expect(await prisma.user.count()).toBe(0);
  });

  it("許可ドメインなら member として登録し、セッションを作る", async () => {
    const res = await POST(post({ email: "Taro@risetech.example", name: "太郎" }));
    expect(res.status).toBe(303);
    expect(res.cookies.get("authjs.session-token")?.httpOnly).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "taro@risetech.example" } });
    expect(user.role).toBe("member");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });

  it("ドメイン外は拒否する", async () => {
    const res = await POST(post({ email: "taro@gmail.com", name: "太郎" }));
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("AccessDenied");
    expect(await prisma.user.count()).toBe(0);
  });

  it("無効化されたユーザーは拒否する", async () => {
    const user = await createUser({ disabledAt: new Date() });
    const res = await POST(post({ email: user.email, name: "x" }));
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("AccessDenied");
    expect(await prisma.session.count()).toBe(0);
  });

  it("別サイトからの送信は拒否する", async () => {
    const res = await POST(post({ email: "taro@risetech.example", name: "太郎" }, "https://evil.example"));
    expect(res.status).toBe(403);
  });
});
