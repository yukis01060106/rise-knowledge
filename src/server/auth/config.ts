import "server-only";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/db";
import { getEnv, type Env } from "@/server/env";
import { isSignInAllowed } from "./sign-in";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function buildProvider(env: Env): Provider {
  if (env.AUTH_PROVIDER === "google") {
    return Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      // アカウント選択画面を自社ドメインに絞る（最終的な判定は isSignInAllowed）
      authorization: { params: { hd: env.AUTH_ALLOWED_DOMAINS[0], prompt: "select_account" } },
      profile: (p) => ({ id: p.sub, name: p.name, email: p.email?.toLowerCase(), image: null }),
    });
  }
  return MicrosoftEntraID({
    clientId: env.AUTH_MICROSOFT_ENTRA_ID_ID,
    clientSecret: env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    issuer: env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    // 既定ではプロフィール写真を Graph API から取得して DB に保存するため、使わない
    authorization: { params: { scope: "openid profile email" } },
    profile: (p) => ({
      id: p.sub,
      name: p.name,
      email: (p.email ?? p.preferred_username)?.toLowerCase(),
      image: null,
    }),
  });
}

function buildConfig(): NextAuthConfig {
  const env = getEnv();
  return {
    adapter: PrismaAdapter(prisma),
    secret: env.AUTH_SECRET,
    // DB セッション：無効化したユーザーのセッションをサーバー側で即時に消せる
    session: { strategy: "database", maxAge: SESSION_MAX_AGE_SECONDS },
    providers: [buildProvider(env)],
    pages: { signIn: "/login", error: "/login" },
    callbacks: {
      signIn: ({ user, account, profile }) =>
        isSignInAllowed({
          provider: account?.provider,
          email: user.email,
          profile: profile as Record<string, unknown> | undefined,
        }),
      session: ({ session, user }) => {
        session.user.id = user.id;
        return session;
      },
    },
    events: {
      signIn: async ({ user }) => {
        if (user.id) {
          await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        }
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
