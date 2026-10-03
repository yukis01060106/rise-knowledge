import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { listTags } from "@/server/articles/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default async function TagsPage() {
  await requireUser();
  const tags = await listTags();

  return (
    <div>
      <PageHeader title="タグ" description="公開中の記事に付いているタグ（記事数順）" />
      {tags.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tags.map((t) => (
            <li key={t.name}>
              <Link
                href={`/tags/${encodeURIComponent(t.name)}`}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 hover:border-brand"
              >
                <span className="truncate font-semibold">#{t.displayName}</span>
                <span className="ml-2 shrink-0 text-sm text-muted">{t.articleCount} 件</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="まだタグはありません" />
      )}
    </div>
  );
}
