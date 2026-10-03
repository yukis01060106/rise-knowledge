import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getEnv } from "@/server/env";
import { isAllowedEmail } from "@/server/auth/allowlist";
import { SESSION_MAX_AGE_SECONDS } from "@/server/auth/config";
import { takeToken } from "@/server/rate-limit";

/**
 * 開発・E2E テスト専用のログイン。SSO を使わずにセッションを作る。
 * AUTH_DEV_LOGIN=true かつ本番以外のときだけ動く（本番では env.ts の検証で起動自体を拒否する）。
 * 許可ドメインと無効化の判定は SSO ログインと同じく行う。
 */
const schema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(100),
});

export async function POST(request: NextRequest) {
  const env = getEnv();
  if (!env.AUTH_DEV_LOGIN || env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  if (!takeToken("devLogin", request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local")) {
    return new NextResponse(null, { status: 429 });
  }

  // 別サイトからのフォーム送信を拒否する
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }

  const form = await request.formData();
  const parsed = schema.safeParse({ email: form.get("email"), name: form.get("name") });
  const loginUrl = new URL("/login", request.url);
  if (!parsed.success || !isAllowedEmail(parsed.data.email, env.AUTH_ALLOWED_DOMAINS)) {
    loginUrl.searchParams.set("error", "AccessDenied");
    return NextResponse.redirect(loginUrl, 303);
  }

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.upsert({
    where: { email },
    update: { lastLoginAt: new Date() },
    create: { email, name: parsed.data.name, lastLoginAt: new Date() },
  });
  if (user.disabledAt) {
    loginUrl.searchParams.set("error", "AccessDenied");
    return NextResponse.redirect(loginUrl, 303);
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return response;
}
