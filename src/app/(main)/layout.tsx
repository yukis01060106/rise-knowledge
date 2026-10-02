import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { logoutAction } from "@/server/auth/actions";
import { DEPARTMENT_LABELS } from "@/lib/labels";

// ログイン後の画面の共通レイアウト。各ページでも requireUser / requireAdmin を呼ぶこと
// （レイアウトはページ遷移のたびに再実行されるとは限らないため）
export default async function MainLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  if (!user.department) redirect("/onboarding");

  return (
    <>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-bold text-emerald-800">
            rise ナレッジ
          </Link>
          <nav className="flex flex-1 gap-4 text-sm">
            {user.role === "admin" && <Link href="/admin/users">ユーザー管理</Link>}
          </nav>
          <span className="text-sm text-gray-600">
            {user.name ?? user.email}（{DEPARTMENT_LABELS[user.department]}）
          </span>
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-gray-600 underline">
              ログアウト
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
