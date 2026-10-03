import { requireUser } from "@/server/auth/guards";
import { listStocks } from "@/server/social/queries";
import { ArticleCards } from "@/components/articles/article-cards";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default async function StocksPage() {
  const user = await requireUser();
  const items = await listStocks(user);
  return (
    <div>
      <PageHeader title="ストック" description="あとで読みたい記事。記事ページの「ストック」から追加できます。" />
      {items.length > 0 ? <ArticleCards articles={items} columns={2} /> : <EmptyState title="ストックした記事はありません" />}
    </div>
  );
}
