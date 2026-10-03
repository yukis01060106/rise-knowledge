import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { findTag, listPublishedArticles } from "@/server/articles/queries";
import { ArticleList } from "@/components/articles/article-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, parsePage } from "@/components/ui/pagination";

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export default async function TagPage({ params, searchParams }: PageProps<"/tags/[name]">) {
  await requireUser();
  const tag = await findTag(safeDecode((await params).name));
  if (!tag) notFound();
  const result = await listPublishedArticles({ tagName: tag.name, page: parsePage((await searchParams).page) });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`#${tag.displayName}`} description={`公開中の記事 ${result.total} 件`} />
      {result.items.length > 0 ? (
        <ArticleList articles={result.items} />
      ) : (
        <EmptyState title="このタグの公開記事はまだありません" />
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath={`/tags/${encodeURIComponent(tag.name)}`}
      />
    </div>
  );
}
