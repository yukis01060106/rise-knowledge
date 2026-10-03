import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { countByCategory, listMyArticles, listPublishedArticles, listTags } from "@/server/articles/queries";
import { ArticleCards, FeaturedArticle } from "@/components/articles/article-cards";
import { CategoryIcon } from "@/components/ui/category-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CATEGORIES } from "@/lib/taxonomy";

export default async function HomePage() {
  const user = await requireUser();
  const [latest, tags, mine, byCategory] = await Promise.all([
    listPublishedArticles({ pageSize: 7 }),
    listTags(16),
    listMyArticles(user, "draft"),
    countByCategory(),
  ]);
  const [featured, ...rest] = latest.items;
  const firstName = (user.name ?? user.email).split(/\s+/).pop();

  return (
    <div className="space-y-12">
      {/* ヒーロー：ロゴの軌道をかたどった円がゆっくり回る */}
      <section className="brand-gradient relative overflow-hidden rounded-3xl px-6 py-10 text-white shadow-[0_24px_48px_-24px_rgb(0_71_157/0.55)] sm:px-10 sm:py-14">
        <span aria-hidden className="orbit orbit-spin -top-40 -right-24 size-[28rem] border-t-white/50 border-r-transparent" />
        <span aria-hidden className="orbit orbit-spin -right-8 -bottom-48 size-80 border-b-white/40 border-l-transparent [animation-duration:60s]" />
        <span aria-hidden className="absolute top-10 right-[22%] size-2 rounded-full bg-white/70" />
        <span aria-hidden className="absolute right-[12%] bottom-16 size-3 rounded-full bg-white/40" />
        <div className="relative max-w-2xl">
          <p className="text-sm font-medium text-white/80">ようこそ、{firstName} さん</p>
          <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight sm:text-5xl">
            学びを、
            <br className="sm:hidden" />
            仲間の武器にする。
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/85 sm:text-base">
            現場で得た知見やハマりどころを、離れて働く仲間へ。
            <br className="hidden sm:inline" />
            離れていても、ひとつのチーム。
          </p>
          <form action="/search" role="search" className="mt-6 flex max-w-lg gap-2 rounded-full bg-white/95 p-1.5 shadow-lg">
            <label htmlFor="hero-search" className="sr-only">
              記事を検索
            </label>
            <input
              id="hero-search"
              name="q"
              type="search"
              placeholder="キーワードで探す（例：Terraform ロック）"
              className="min-w-0 flex-1 rounded-full bg-transparent px-4 text-sm text-foreground placeholder:text-gray-400 focus:outline-none"
            />
            <button type="submit" className="brand-gradient rounded-full px-5 py-2 text-sm font-semibold text-white">
              検索
            </button>
          </form>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/90">
            <Link href="/articles/new" className="inline-flex items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
              ✍ 記事を書く
            </Link>
            <span>
              公開記事 <strong className="text-lg">{latest.total}</strong> 本
            </span>
            <span>
              あなたの下書き <strong className="text-lg">{mine.countByTab.draft}</strong> 件
            </span>
          </div>
        </div>
      </section>

      {/* 分類から探す */}
      <section>
        <h2 className="mb-4 text-xl font-bold">分類から探す</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {CATEGORIES.map((c) => (
            <Link
              key={c.key}
              href={`/articles?cat=${c.key}`}
              className={`cat-${c.key} cat-gradient group relative overflow-hidden rounded-2xl p-5 text-white shadow-md transition-transform hover:-translate-y-0.5`}
            >
              <span aria-hidden className="orbit -right-10 -bottom-16 size-40 border-white/25" />
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white/20">
                <CategoryIcon category={c.key} className="size-5" />
              </span>
              <p className="mt-4 text-lg font-bold">{c.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/85">{c.description}</p>
              <p className="mt-4 text-sm font-semibold">
                {byCategory[c.key]} 本 <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* 新着 */}
      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_260px]">
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-bold">新着記事</h2>
            <Link href="/articles" className="text-sm font-medium text-brand hover:underline">
              すべて見る →
            </Link>
          </div>
          {featured ? (
            <>
              <FeaturedArticle a={featured} />
              {rest.length > 0 && <ArticleCards articles={rest} columns={2} />}
            </>
          ) : (
            <EmptyState title="まだ公開された記事はありません">最初の記事を書いてみませんか？</EmptyState>
          )}
        </section>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="text-sm font-bold">自分の記事</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
              {(
                [
                  ["下書き", mine.countByTab.draft, "/me/articles"],
                  ["審査中", mine.countByTab.review, "/me/articles?tab=review"],
                  ["差し戻し", mine.countByTab.rejected, "/me/articles?tab=rejected"],
                  ["公開中", mine.countByTab.published, "/me/articles?tab=published"],
                ] as const
              ).map(([label, n, href]) => (
                <Link key={label} href={href} className="rounded-xl bg-background px-2 py-3 hover:bg-brand-soft">
                  <dd className="text-2xl font-bold">{n}</dd>
                  <dt className="text-xs text-muted">{label}</dt>
                </Link>
              ))}
            </dl>
          </section>
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">人気のタグ</h2>
              <Link href="/tags" className="text-xs text-brand hover:underline">
                一覧
              </Link>
            </div>
            {tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Link
                    key={t.name}
                    href={`/tags/${encodeURIComponent(t.name)}`}
                    className="rounded-full border border-border px-2.5 py-1 text-xs hover:border-brand hover:text-brand"
                  >
                    #{t.displayName}
                    <span className="ml-1 text-muted">{t.articleCount}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">まだタグはありません</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
