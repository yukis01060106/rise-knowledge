import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { listMyArticles, listPublishedArticles, listTags } from "@/server/articles/queries";
import { ArticleList } from "@/components/articles/article-list";
import { EmptyState } from "@/components/ui/empty-state";
import { TagChip } from "@/components/ui/tag-chip";
import { buttonClass } from "@/components/ui/button";

export default async function HomePage() {
  const user = await requireUser();
  const [latest, tags, mine] = await Promise.all([
    listPublishedArticles({ pageSize: 10 }),
    listTags(15),
    listMyArticles(user, "draft"),
  ]);

  return (
    <div className="space-y-8">
      <section className="rounded-xl bg-gradient-to-br from-brand to-brand-strong px-6 py-8 text-white sm:px-8">
        <p className="text-sm opacity-80">ようこそ、{user.name ?? user.email} さん</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">学びを、仲間の武器にする！</h1>
        <p className="mt-2 max-w-xl text-sm opacity-90">
          現場で得た知見やハマりどころを共有しましょう。離れていても、ひとつのチーム。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/articles/new" className={buttonClass("secondary", "md", "border-transparent")}>
            記事を書く
          </Link>
          <Link href="/articles" className="rounded-md px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/50 hover:bg-white/10">
            記事を読む
          </Link>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">新着記事</h2>
            <Link href="/articles" className="text-sm text-brand hover:underline">
              すべて見る →
            </Link>
          </div>
          {latest.items.length > 0 ? (
            <ArticleList articles={latest.items} />
          ) : (
            <EmptyState title="まだ公開された記事はありません">最初の記事を書いてみませんか？</EmptyState>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-bold">自分の記事</h2>
            <p className="mt-2 text-sm text-muted">
              下書き <span className="text-lg font-bold text-foreground">{mine.countByTab.draft}</span> 件 ・ 公開中{" "}
              <span className="text-lg font-bold text-foreground">{mine.countByTab.published}</span> 件
            </p>
            <Link href="/me/articles" className="mt-3 inline-block text-sm text-brand hover:underline">
              自分の記事を見る →
            </Link>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">人気のタグ</h2>
              <Link href="/tags" className="text-xs text-brand hover:underline">
                一覧
              </Link>
            </div>
            {tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <TagChip key={t.name} name={t.name} displayName={t.displayName} />
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
