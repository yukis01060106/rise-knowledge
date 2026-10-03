import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { getArticleDetail, type VersionView } from "@/server/articles/queries";
import { renderMarkdown } from "@/server/markdown/render";
import { Avatar } from "@/components/ui/avatar";
import { DepartmentBadge } from "@/components/ui/department-badge";
import { TagChip } from "@/components/ui/tag-chip";
import { buttonClass } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/format";
import { UNTITLED } from "@/lib/articles";
import { VERSION_STATUS_LABELS } from "@/lib/labels";

export default async function ArticlePage({ params }: PageProps<"/articles/[id]">) {
  const user = await requireUser();
  const article = await getArticleDetail(user, (await params).id);
  if (!article) notFound();

  // 公開中の版があればそれを表示する。未公開の記事は著者にだけ作業中の版をプレビューとして見せる
  const shown = article.published ?? article.working;
  if (!shown) notFound();
  const isPreview = !article.published;
  const html = await renderMarkdown(shown.bodyMd);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {article.hidden && (article.isAuthor || user.role === "admin") && (
        <div role="status" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">この記事は管理者によって非公開になっています。ほかの人には表示されません。</p>
          {article.hiddenReason && <p className="mt-1 whitespace-pre-wrap">理由：{article.hiddenReason}</p>}
        </div>
      )}
      {article.isAuthor && article.working && <WorkingVersionNotice articleId={article.id} working={article.working} isPreview={isPreview} />}

      <article className="rounded-xl border border-border bg-surface px-5 py-6 sm:px-10 sm:py-10">
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <Avatar name={article.author.name} department={article.author.department} />
            <div className="text-sm">
              <p className="font-semibold">
                {article.author.name}
                {article.isAuthor && article.author.isInitials && (
                  <span className="ml-2 rounded bg-background px-1.5 py-0.5 text-xs font-normal text-muted">イニシャルで表示中</span>
                )}
              </p>
              <p className="flex items-center gap-2 text-xs text-muted">
                <DepartmentBadge department={article.author.department} />
                {article.firstPublishedAt ? `${formatDate(article.firstPublishedAt)} に公開` : "未公開"}
                {article.published && article.published.versionNo > 1 && ` ・ ${formatDate(article.published.updatedAt)} 更新`}
              </p>
            </div>
            {article.isAuthor && !article.working && (
              <Link href={`/articles/${article.id}/edit`} className={buttonClass("secondary", "sm", "ml-auto")}>
                編集する
              </Link>
            )}
          </div>
          <h1 className="mt-6 text-2xl leading-snug font-bold sm:text-3xl">{shown.title || UNTITLED}</h1>
          {shown.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {shown.tags.map((t) => (
                <TagChip key={t.name} {...t} />
              ))}
            </div>
          )}
        </header>
        {/* renderMarkdown はサニタイズ済みの HTML だけを返す */}
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  );
}

function WorkingVersionNotice({ articleId, working, isPreview }: { articleId: string; working: VersionView; isPreview: boolean }) {
  const rejected = working.status === "rejected";
  const reviewing = working.status === "ai_review" || working.status === "admin_review";
  const tone = rejected ? "border-red-200 bg-red-50 text-red-900" : reviewing ? "border-sky-200 bg-sky-50 text-sky-900" : "border-amber-200 bg-amber-50 text-amber-900";
  const message = rejected
    ? `v${working.versionNo} は差し戻されました。修正して、もう一度レビューを申請してください。`
    : reviewing
      ? `v${working.versionNo} は審査中です（${VERSION_STATUS_LABELS[working.status]}）。承認されると公開されます。`
      : isPreview
        ? "まだ公開されていない記事です（あなたにだけ表示されています）。"
        : "編集中の新しい版があります。公開中の内容は、新しい版が承認されるまで変わりません。";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <div>
        <p>{message}</p>
        {rejected && working.rejectReason && <p className="mt-1 whitespace-pre-wrap">理由：{working.rejectReason}</p>}
        <p className="mt-1 text-xs opacity-80">
          v{working.versionNo}・{VERSION_STATUS_LABELS[working.status]}・
          {reviewing ? `申請 ${formatDateTime(working.submittedAt)}` : `最終保存 ${formatDateTime(working.updatedAt)}`}
        </p>
      </div>
      {!reviewing && (
        <Link href={`/articles/${articleId}/edit`} className={buttonClass("secondary", "sm")}>
          {rejected ? "修正する" : "編集を続ける"}
        </Link>
      )}
    </div>
  );
}
