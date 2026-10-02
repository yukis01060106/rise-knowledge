import "server-only";
import { prisma } from "@/server/db";
import { getEnv } from "@/server/env";
import { isAllowedEmail } from "./allowlist";

type SignInInput = {
  provider: string | undefined;
  email: string | null | undefined;
  /** OIDC の ID トークンのクレーム */
  profile: Record<string, unknown> | undefined;
};

/**
 * ログインを許可するか。Auth.js の signIn コールバックから呼ぶ。
 * false を返すと Auth.js は AccessDenied としてログイン画面に戻す。
 */
export async function isSignInAllowed({ provider, email, profile }: SignInInput): Promise<boolean> {
  const env = getEnv();

  if (provider !== env.AUTH_PROVIDER) return false;
  if (!isAllowedEmail(email, env.AUTH_ALLOWED_DOMAINS)) return false;

  if (provider === "google") {
    // 個人の Gmail などを弾くため、Workspace のドメイン（hd）と検証済みメールを要求する
    if (profile?.email_verified !== true) return false;
    const hd = typeof profile.hd === "string" ? profile.hd.toLowerCase() : "";
    if (!env.AUTH_ALLOWED_DOMAINS.includes(hd)) return false;
  }
  // Entra ID はテナント固定の issuer で、他テナントのトークンを受け付けない（env.ts で検証）

  const existing = await prisma.user.findUnique({
    where: { email: email!.trim().toLowerCase() },
    select: { disabledAt: true },
  });
  if (existing?.disabledAt) return false;

  return true;
}
