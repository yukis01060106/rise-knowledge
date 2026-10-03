import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/guards";
import { getVersionForReview } from "@/server/articles/admin-queries";
import { renderMarkdown } from "@/server/markdown/render";
import { DiffView } from "@/components/articles/diff-view";
import { Avatar } from "@/components/ui/avatar";
import { DepartmentBadge } from "@/components/ui/department-badge";
import { TagChip } from "@/components/ui/tag-chip";
import { formatDateTime } from "@/lib/format";
import { VERSION_STATUS_LABELS } from "@/lib/labels";
import { ReviewActions } from "./review-actions";

export default async function ReviewPage({ params }: PageProps<"/admin/reviews/[versionId]">) {
  const admin = await requireAdmin();
  const review = await getVersionForReview(admin, (await params).versionId);
  if (!review) notFound();
  const { version, article, compareTo, previousRejected, isSelf } = review;
  const html = await renderMarkdown(version.bodyMd);
  const reviewable = version.status === "admin_review";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-6">
        <div>
          <Link href="/admin/reviews" className="text-sm text-brand hover:underline">
            ← レビュー待ちへ
          </Link>
          <h1 className="mt-2 text-2xl leading-snug font-bold">{version.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Avatar name={article.author.name} department={article.author.department} size="sm" />
            <span className="text-foreground">{article.author.name ?? "名前未設定"}</span>
            <DepartmentBadge department={article.author.department} />
            <span>v{version.versionNo}</span>
            <span>申請 {formatDateTime(version.submittedAt)}</span>
          </div>
          {version.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {version.tags.map((t) => (
                <TagChip key={t.name} {...t} />
              ))}
            </div>
          )}
        </div>

        {version.aiCheckFailed && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>AI チェック未実施：</strong>AI チェックに失敗したため、AI の判定がありません。機密情報が含まれていないか、特に注意して確認してください。
          </p>
        )}

        {previousRejected && (
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="font-bold">前回差し戻した版からの修正</h2>
            {previousRejected.rejectReason && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm whitespace-pre-wrap text-red-900">
                差し戻しの理由：{previousRejected.rejectReason}
              </p>
            )}
            <div className="mt-3">
              <DiffView
                before={previousRejected}
                after={version}
                beforeLabel={`差し戻し v${previousRejected.versionNo}`}
                afterLabel={`申請 v${version.versionNo}`}
              />
            </div>
          </section>
        )}

        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="mb-3 font-bold">{compareTo ? "公開中の版との差分" : "差分"}</h2>
          {compareTo ? (
            <DiffView
              before={compareTo}
              after={version}
              beforeLabel={`公開中 v${compareTo.versionNo}`}
              afterLabel={`申請 v${version.versionNo}`}
            />
          ) : (
            <p className="text-sm text-muted">初めての公開のため、比較する版はありません。</p>
          )}
        </section>

        <section className="rounded-xl border border-border bg-surface px-5 py-6 sm:px-8">
          <h2 className="mb-4 border-b border-border pb-2 font-bold">本文（公開時の表示）</h2>
          {/* renderMarkdown はサニタイズ済みの HTML だけを返す */}
          <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-bold">審査</h2>
          <p className="mt-1 text-xs text-muted">状態：{VERSION_STATUS_LABELS[version.status]}</p>
          <div className="mt-3">
            {!reviewable ? (
              <div className="space-y-1 text-sm">
                <p>この版は審査待ちではありません。</p>
                {version.decidedAt && (
                  <p className="text-xs text-muted">
                    {formatDateTime(version.decidedAt)}・{version.decider?.name ?? "システム"}
                  </p>
                )}
                {version.rejectReason && <p className="whitespace-pre-wrap text-xs">理由：{version.rejectReason}</p>}
              </div>
            ) : isSelf ? (
              <p className="text-sm">自分の記事は承認・差し戻しできません。ほかの管理者に依頼してください。</p>
            ) : (
              <ReviewActions versionId={version.id} />
            )}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="font-bold">確認のポイント</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
            <li>客先名・案件名・人名が書かれていないか</li>
            <li>IP アドレス・ホスト名・URL・認証情報が残っていないか</li>
            <li>画像やログに社外秘の情報が写っていないか</li>
            <li>社外への批判や不適切な表現がないか</li>
          </ul>
        </section>
        <Link href={`/admin/articles/${article.id}/versions`} className="block text-sm text-brand hover:underline">
          この記事の版の履歴 →
        </Link>
      </aside>
    </div>
  );
}
