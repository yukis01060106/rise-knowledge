import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { NavLinks } from "@/components/layout/nav-links";
import { UserMenu } from "@/components/layout/user-menu";
import { buttonClass } from "@/components/ui/button";

// ログイン後の画面の共通レイアウト。各ページでも requireUser / requireAdmin を呼ぶこと
// （レイアウトはページ遷移のたびに再実行されるとは限らないため）
export default async function MainLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  if (!user.department) redirect("/onboarding");

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand-strong">
            <span aria-hidden className="inline-flex size-7 items-center justify-center rounded-md bg-brand text-sm text-white">
              r
            </span>
            rise ナレッジ
          </Link>
          <NavLinks />
          <form action="/search" role="search" className="order-last w-full sm:order-none sm:ml-auto sm:w-64">
            <label htmlFor="header-search" className="sr-only">
              記事を検索
            </label>
            <input
              id="header-search"
              name="q"
              type="search"
              placeholder="記事を検索"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:border-brand focus:bg-surface focus:outline-none"
            />
          </form>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <Link href="/articles/new" className={buttonClass("primary", "sm")}>
              記事を書く
            </Link>
            <UserMenu name={user.name} email={user.email} department={user.department} role={user.role} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        rise tech solutions 社内限定 ・ 離れていても、ひとつのチーム！
      </footer>
    </>
  );
}
