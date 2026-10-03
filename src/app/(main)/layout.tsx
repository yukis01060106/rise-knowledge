import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { countPendingReviews } from "@/server/articles/admin-queries";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SideNav } from "@/components/layout/side-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { buttonClass } from "@/components/ui/button";

// ログイン後の画面の共通レイアウト。各ページでも requireUser / requireAdmin を呼ぶこと
// （レイアウトはページ遷移のたびに再実行されるとは限らないため）
export default async function MainLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  if (!user.department) redirect("/onboarding");
  const isAdmin = user.role === "admin";
  const pendingReviews = isAdmin ? await countPendingReviews(user) : 0;

  return (
    <>
      <header className="glass sticky top-0 z-20 border-b border-white/60 shadow-[0_1px_0_rgb(15_35_70/0.06)]">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand-strong">
            <Image src="/brand/logo.png" alt="" width={30} height={28} priority />
            <span className="brand-text hidden text-lg tracking-tight sm:inline">ライズ・ナレッジ</span>
          </Link>
          <form action="/search" role="search" className="ml-auto hidden w-72 md:block">
            <label htmlFor="header-search" className="sr-only">
              記事を検索
            </label>
            <input
              id="header-search"
              name="q"
              type="search"
              placeholder="記事を検索"
              className="w-full rounded-full border border-border bg-surface/80 px-4 py-1.5 text-sm focus:border-brand focus:bg-surface focus:outline-none"
            />
          </form>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link href="/articles/new" className={buttonClass("primary", "sm", "brand-gradient rounded-full px-3.5 shadow-sm")}>
              記事を書く
            </Link>
            <UserMenu name={user.name} email={user.email} department={user.department} role={user.role} />
            {/* 右利きの人が多いため、メニューは右側に置く */}
            <Suspense>
              <MobileNav isAdmin={isAdmin} pendingReviews={pendingReviews} />
            </Suspense>
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 lg:grid-cols-[minmax(0,1fr)_200px]">
        {/* メニューは右側（右利きの人が多いため）。読み上げ順ではメニューを先にする */}
        <aside className="hidden lg:order-last lg:block">
          <div className="sticky top-16 py-8">
            <Suspense>
              <SideNav isAdmin={isAdmin} pendingReviews={pendingReviews} />
            </Suspense>
          </div>
        </aside>
        <main className="min-w-0 py-8">{children}</main>
      </div>
      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        rise tech solutions 社内限定 ・ 離れていても、ひとつのチーム！
      </footer>
    </>
  );
}
