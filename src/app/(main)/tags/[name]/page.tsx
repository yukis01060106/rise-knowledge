import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { findTag, listPublishedArticles } from "@/server/articles/queries";
import { isFollowingTag } from "@/server/social/queries";
import { ArticleCards } from "@/components/articles/article-cards";
import { FollowTagButton } from "@/components/social/follow-tag-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, parsePage } from "@/components/ui/pagination";

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export default async function TagPage({ params, searchParams }: PageProps<"/tags/[name]">) {
  const user = await requireUser();
  const tag = await findTag(safeDecode((await params).name));
  if (!tag) notFound();
  const [result, following] = await Promise.all([
    listPublishedArticles({ tagName: tag.name, page: parsePage((await searchParams).page) }),
    isFollowingTag(user, tag.name),
  ]);

  return (
    <div className="space-y-6">
      <header className="brand-gradient relative flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-3xl px-6 py-7 text-white sm:px-8">
        <span aria-hidden className="orbit orbit-spin -top-24 -right-16 size-72 border-t-white/50 border-r-transparent" />
        <div className="relative">
          <p className="text-sm text-white/80">タグ</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">#{tag.displayName}</h1>
          <p className="mt-1 text-sm text-white/85">公開中の記事 {result.total} 件。フォローすると、トップに新着が出ます。</p>
        </div>
        <div className="relative">
          <FollowTagButton tagName={tag.name} following={following} />
        </div>
      </header>
      {result.items.length > 0 ? <ArticleCards articles={result.items} columns={2} /> : <EmptyState title="このタグの公開記事はまだありません" />}
      <Pagination page={result.page} pageCount={result.pageCount} basePath={`/tags/${encodeURIComponent(tag.name)}`} />
    </div>
  );
}
