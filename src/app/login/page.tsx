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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="text-center">
        <span aria-hidden className="mx-auto mb-3 inline-flex size-12 items-center justify-center rounded-xl bg-brand text-2xl font-bold text-white">
          r
        </span>
        <h1 className="text-2xl font-bold text-brand-strong">rise ナレッジ</h1>
        <p className="mt-2 text-sm text-muted">離れていても、ひとつのチーム！</p>
      </div>

      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error === "AccessDenied"
            ? `このアカウントではログインできません。会社のアカウント（${domains}）でログインしてください。`
            : "ログインに失敗しました。時間をおいてもう一度お試しください。"}
        </p>
      )}

      <form action={loginAction}>
        <input type="hidden" name="callbackUrl" value={safeCallbackPath(callbackUrl)} />
        <button
          type="submit"
          className="w-full rounded-md bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-strong"
        >
          {PROVIDER_LABELS[env.AUTH_PROVIDER]} でログイン
        </button>
      </form>

      {env.AUTH_DEV_LOGIN && env.NODE_ENV !== "production" && (
        <form action="/api/dev-login" method="post" className="space-y-2 rounded-lg border border-dashed border-amber-500 bg-surface p-4">
          <p className="text-xs font-semibold text-amber-700">開発用ログイン（AUTH_DEV_LOGIN=true のときだけ表示）</p>
          <input name="email" type="email" required placeholder={`taro${domains.split("、")[0]}`} className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          <input name="name" required placeholder="名前" className="w-full rounded-md border border-border px-2 py-1.5 text-sm" />
          <button type="submit" className="w-full rounded-md border border-amber-600 px-2 py-1.5 text-sm hover:bg-amber-50">
            開発用ログイン
          </button>
        </form>
      )}
    </main>
  );
}
