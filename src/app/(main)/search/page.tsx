import { requireUser } from "@/server/auth/guards";
import { searchPublishedArticles } from "@/server/articles/queries";
import { ArticleCards } from "@/components/articles/article-cards";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { buttonClass } from "@/components/ui/button";

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireUser();
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.slice(0, 200).trim() ?? "";
  const result = q ? await searchPublishedArticles(q, parsePage(sp.page)) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="検索"
        description={result ? `「${q}」の検索結果 ${result.total} 件` : "タイトル・本文・タグから探せます。空白で区切ると、すべての語を含む記事を探します。"}
      />
      <form action="/search" role="search" className="mb-6 flex gap-2">
        <label htmlFor="search-q" className="sr-only">
          検索語
        </label>
        <input
          id="search-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="例：Terraform 状態ファイル"
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 focus:border-brand focus:outline-none"
        />
        <button type="submit" className={buttonClass()}>
          検索
        </button>
      </form>
      {result &&
        (result.items.length > 0 ? (
          <ArticleCards articles={result.items} />
        ) : (
          <EmptyState title="見つかりませんでした">別のことばや、短いことばで試してみてください。</EmptyState>
        ))}
      {result && <Pagination page={result.page} pageCount={result.pageCount} basePath="/search" params={{ q }} />}
    </div>
  );
}
