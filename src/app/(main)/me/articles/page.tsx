import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { listMyArticles, MY_ARTICLE_TABS, type MyArticleTab } from "@/server/articles/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { UNTITLED } from "@/lib/articles";
import { VERSION_STATUS_LABELS } from "@/lib/labels";

const TAB_LABELS: Record<MyArticleTab, string> = {
  draft: "下書き",
  review: "審査中",
  rejected: "差し戻し",
  published: "公開中",
};

function parseTab(v: string | string[] | undefined): MyArticleTab {
  return MY_ARTICLE_TABS.find((t) => t === v) ?? "draft";
}

export default async function MyArticlesPage({ searchParams }: PageProps<"/me/articles">) {
  const user = await requireUser();
  const tab = parseTab((await searchParams).tab);
  const { items, countByTab } = await listMyArticles(user, tab);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="自分の記事"
        actions={
          <Link href="/articles/new" className={buttonClass()}>
            記事を書く
          </Link>
        }
      />
      <nav aria-label="記事の状態" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {MY_ARTICLE_TABS.map((t) => (
          <Link
            key={t}
            href={t === "draft" ? "/me/articles" : `/me/articles?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${
              t === tab ? "border-brand text-brand-strong" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {TAB_LABELS[t]}
            <span className="ml-1.5 rounded-full bg-background px-1.5 text-xs">{countByTab[t]}</span>
          </Link>
        ))}
      </nav>

      {items.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/articles/${a.id}`} className="block truncate font-semibold hover:text-brand">
                  {a.title || UNTITLED}
                </Link>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                  {a.working && (
                    <span>
                      v{a.working.versionNo}・{VERSION_STATUS_LABELS[a.working.status]}
                    </span>
                  )}
                  {a.published && <span className="text-brand">公開中</span>}
                  {a.hidden && <span className="text-danger">非公開（管理者）</span>}
                  <span>更新 {formatDateTime(a.updatedAt)}</span>
                </p>
              </div>
              {(!a.working || a.working.status === "draft") && (
                <Link href={`/articles/${a.id}/edit`} className={buttonClass("secondary", "sm")}>
                  編集
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={`${TAB_LABELS[tab]}の記事はありません`} />
      )}
    </div>
  );
}
