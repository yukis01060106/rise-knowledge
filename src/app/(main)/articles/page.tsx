import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { listPublishedArticles } from "@/server/articles/queries";
import { ArticleList } from "@/components/articles/article-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { DEPARTMENT_LABELS } from "@/lib/labels";
import type { Department } from "@/generated/prisma/enums";

const FILTERS: { value: Department | undefined; label: string }[] = [
  { value: undefined, label: "すべて" },
  { value: "dev", label: DEPARTMENT_LABELS.dev },
  { value: "infra", label: DEPARTMENT_LABELS.infra },
];

function parseDepartment(v: string | string[] | undefined): Department | undefined {
  return v === "dev" || v === "infra" ? v : undefined;
}

export default async function ArticlesPage({ searchParams }: PageProps<"/articles">) {
  await requireUser();
  const sp = await searchParams;
  const department = parseDepartment(sp.dept);
  const result = await listPublishedArticles({ department, page: parsePage(sp.page) });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="記事" description={`公開中の記事 ${result.total} 件（新着順）`} />
      <nav aria-label="部署で絞り込み" className="mb-4 flex gap-1 border-b border-border">
        {FILTERS.map((f) => {
          const active = f.value === department;
          return (
            <Link
              key={f.label}
              href={f.value ? `/articles?dept=${f.value}` : "/articles"}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                active ? "border-brand text-brand-strong" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>
      {result.items.length > 0 ? (
        <ArticleList articles={result.items} />
      ) : (
        <EmptyState title="記事はまだありません" />
      )}
      <Pagination page={result.page} pageCount={result.pageCount} basePath="/articles" params={{ dept: department }} />
    </div>
  );
}
