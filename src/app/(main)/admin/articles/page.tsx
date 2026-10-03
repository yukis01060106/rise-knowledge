import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { listArticlesForAdmin } from "@/server/articles/admin-queries";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { formatDateTime } from "@/lib/format";
import { VERSION_STATUS_LABELS } from "@/lib/labels";
import { HideToggle } from "./hide-toggle";

const FILTERS = [
  { value: "all", label: "すべて" },
  { value: "published", label: "公開中" },
  { value: "hidden", label: "非公開" },
] as const;

type Filter = (typeof FILTERS)[number]["value"];

export default async function AdminArticlesPage({ searchParams }: PageProps<"/admin/articles">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const filter: Filter = FILTERS.find((f) => f.value === sp.filter)?.value ?? "all";
  const result = await listArticlesForAdmin(admin, { page: parsePage(sp.page), filter });

  return (
    <div>
      <PageHeader title="記事管理" description="一度でも審査に出た記事の一覧。緊急非公開・再公開には理由が必要です（監査ログに残ります）。" />
      <nav className="mb-4 flex gap-1 border-b border-border">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/admin/articles" : `/admin/articles?filter=${f.value}`}
            aria-current={f.value === filter ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              f.value === filter ? "border-brand text-brand-strong" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {result.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-background text-left text-xs text-muted">
                <th className="px-3 py-2">タイトル</th>
                <th className="px-3 py-2">著者</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">更新</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((a) => (
                <tr key={a.id} className="border-b border-border align-top last:border-0">
                  <td className="max-w-xs px-3 py-2">
                    {a.publishedVersionNo ? (
                      <Link href={`/articles/${a.id}`} className="font-semibold hover:text-brand">
                        {a.title}
                      </Link>
                    ) : (
                      <span className="font-semibold">{a.title}</span>
                    )}
                    <Link href={`/admin/articles/${a.id}/versions`} className="mt-0.5 block text-xs text-brand hover:underline">
                      版の履歴
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{a.author.name ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-1">
                      {a.hidden ? (
                        <span className="w-fit rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-800">非公開</span>
                      ) : a.publishedVersionNo ? (
                        <span className="w-fit rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">公開中 v{a.publishedVersionNo}</span>
                      ) : (
                        <span className="w-fit rounded bg-gray-100 px-1.5 py-0.5">未公開</span>
                      )}
                      {a.latestSubmitted && a.latestSubmitted.versionNo !== a.publishedVersionNo && (
                        <span className="text-muted">
                          v{a.latestSubmitted.versionNo}：{VERSION_STATUS_LABELS[a.latestSubmitted.status]}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-muted">{formatDateTime(a.updatedAt)}</td>
                  <td className="px-3 py-2">
                    {a.publishedVersionNo && (
                      <HideToggle articleId={a.id} hidden={a.hidden} canUnhide={a.author.id !== admin.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="該当する記事はありません" />
      )}
      <Pagination page={result.page} pageCount={result.pageCount} basePath="/admin/articles" params={{ filter: filter === "all" ? undefined : filter }} />
    </div>
  );
}
