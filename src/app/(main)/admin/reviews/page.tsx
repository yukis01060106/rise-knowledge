import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { listPendingReviews } from "@/server/articles/admin-queries";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DepartmentBadge } from "@/components/ui/department-badge";
import { CategoryBadge } from "@/components/ui/category-badge";
import { formatDateTime } from "@/lib/format";

const DONE_MESSAGES: Record<string, string> = {
  approved: "承認して公開しました",
  rejected: "差し戻しました",
};

export default async function ReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const admin = await requireAdmin();
  const reviews = await listPendingReviews(admin);
  const done = (await searchParams).done;
  const doneMessage = typeof done === "string" ? DONE_MESSAGES[done] : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="レビュー待ち" description="申請の古い順。自分の記事は承認できません（ほかの管理者に依頼してください）。" />
      {doneMessage && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {doneMessage}
        </p>
      )}
      {reviews.length > 0 ? (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {reviews.map((r) => {
            const self = r.author.id === admin.id;
            return (
              <li key={r.versionId}>
                <Link href={`/admin/reviews/${r.versionId}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-background">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${r.isUpdate ? "bg-sky-50 text-sky-800" : "bg-emerald-50 text-emerald-800"}`}>
                        {r.isUpdate ? `更新 v${r.versionNo}` : "新規"}
                      </span>
                      <CategoryBadge category={r.category} />
                      {r.aiCheckFailed && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">AI チェック未実施</span>}
                      {r.showInitials && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-800">イニシャル表示</span>}
                      {self && <span className="rounded bg-gray-100 px-1.5 py-0.5">自分の記事</span>}
                      <span>{r.author.name ?? "名前未設定"}</span>
                      <DepartmentBadge department={r.author.department} />
                    </p>
                    <p className="mt-1 truncate font-semibold">{r.title}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">申請 {formatDateTime(r.submittedAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="レビュー待ちの記事はありません" />
      )}
    </div>
  );
}
