import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { loginAction } from "@/server/auth/actions";
import { getEnv } from "@/server/env";
import { safeCallbackPath } from "@/lib/safe-redirect";

const PROVIDER_LABELS = {
  google: "Google Workspace",
  "microsoft-entra-id": "Microsoft",
} as const;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");

  const env = getEnv();
  const { error, callbackUrl } = await searchParams;
  const domains = env.AUTH_ALLOWED_DOMAINS.map((d) => `@${d}`).join("、");

  return (
    <main className="grid min-h-screen flex-1 lg:grid-cols-[1.1fr_1fr]">
      {/* 左：ブランドの面（ロゴの軌道をかたどった円が回る） */}
      <section className="brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span aria-hidden className="orbit orbit-spin -top-48 -left-32 size-[36rem] border-t-white/50 border-l-transparent" />
        <span aria-hidden className="orbit orbit-spin -right-40 -bottom-56 size-[30rem] border-b-white/40 border-r-transparent [animation-duration:70s]" />
        <div className="relative flex items-center gap-3">
          <span className="rounded-2xl bg-white p-2 shadow-lg">
            <Image src="/brand/logo.png" alt="" width={40} height={38} priority />
          </span>
          <span className="text-xl font-bold">rise ナレッジ</span>
        </div>
        <div className="relative space-y-6">
          <p className="text-4xl leading-tight font-bold tracking-tight xl:text-5xl">
            離れていても、
            <br />
            ひとつのチーム！
          </p>
          <p className="max-w-md text-white/85">「学びを、仲間の武器にする！」現場で得た知見を、客先で働く仲間へ届ける rise tech solutions の社内ナレッジ共有サイトです。</p>
          <ul className="flex flex-wrap gap-2 text-sm">
            {["開発", "インフラ", "キャリア・働き方"].map((t) => (
              <li key={t} className="rounded-full bg-white/15 px-3 py-1 ring-1 ring-white/30">
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/70">社内限定・社外からは利用できません</p>
      </section>

      {/* 右：ログイン */}
      <section className="flex flex-col justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="text-center lg:text-left">
            <Image src="/brand/logo.png" alt="rise tech solutions" width={68} height={64} priority className="mx-auto mb-4 lg:hidden" />
            <h1 className="text-2xl font-bold tracking-tight">ログイン</h1>
            <p className="mt-1 text-sm text-muted">会社のアカウント（{domains}）でログインしてください。</p>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error === "AccessDenied"
                ? `このアカウントではログインできません。会社のアカウント（${domains}）でログインしてください。`
                : "ログインに失敗しました。時間をおいてもう一度お試しください。"}
            </p>
          )}

          <form action={loginAction}>
            <input type="hidden" name="callbackUrl" value={safeCallbackPath(callbackUrl)} />
            <button
              type="submit"
              className="brand-gradient w-full rounded-xl px-4 py-3.5 font-semibold text-white shadow-[0_12px_24px_-12px_rgb(0_71_157/0.7)] transition-transform hover:-translate-y-0.5"
            >
              {PROVIDER_LABELS[env.AUTH_PROVIDER]} でログイン
            </button>
          </form>

          {env.AUTH_DEV_LOGIN && env.NODE_ENV !== "production" && (
            <form action="/api/dev-login" method="post" className="space-y-2 rounded-xl border border-dashed border-amber-400 bg-amber-50/60 p-4">
              <p className="text-xs font-semibold text-amber-800">開発用ログイン（AUTH_DEV_LOGIN=true のときだけ表示）</p>
              <input
                name="email"
                type="email"
                required
                placeholder={`taro${domains.split("、")[0]}`}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              />
              <input name="name" required placeholder="名前" className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
              <button type="submit" className="w-full rounded-lg border border-amber-500 bg-surface px-3 py-2 text-sm font-medium hover:bg-amber-50">
                開発用ログイン
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
