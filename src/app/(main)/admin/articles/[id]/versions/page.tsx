import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/guards";
import { getArticleHistory } from "@/server/articles/admin-queries";
import { renderMarkdown } from "@/server/markdown/render";
import { DiffView } from "@/components/articles/diff-view";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/format";
import { AUDIT_ACTION_LABELS, VERSION_STATUS_LABELS } from "@/lib/labels";

export default async function VersionHistoryPage({ params, searchParams }: PageProps<"/admin/articles/[id]/versions">) {
  const admin = await requireAdmin();
  const history = await getArticleHistory(admin, (await params).id);
  if (!history) notFound();
  const { v } = await searchParams;

  // 表示する版（既定は最新）と、その 1 つ前の審査に出た版を比べる
  const index = Math.max(0, history.versions.findIndex((x) => x.id === v));
  const selected = history.versions[index];
  const previous = history.versions[index + 1] ?? null;
  const html = await renderMarkdown(selected.bodyMd);
  const versionNoById = new Map(history.versions.map((x) => [x.id, x.versionNo]));

  return (
    <div>
      <PageHeader
        title="版の履歴"
        description={`${history.author.name ?? "名前未設定"} さんの記事${history.hidden ? "（緊急非公開中）" : ""}。審査に出た版だけを表示します。`}
        actions={
          history.publishedVersionId && (
            <Link href={`/articles/${history.id}`} className="text-sm text-brand hover:underline">
              記事ページ →
            </Link>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-6">
          <nav aria-label="版の一覧">
            <ul className="overflow-hidden rounded-lg border border-border bg-surface text-sm">
              {history.versions.map((x) => (
                <li key={x.id} className="border-b border-border last:border-0">
                  <Link
                    href={`/admin/articles/${history.id}/versions?v=${x.id}`}
                    aria-current={x.id === selected.id ? "page" : undefined}
                    className={`block px-3 py-2 ${x.id === selected.id ? "bg-brand-soft" : "hover:bg-background"}`}
                  >
                    <span className="font-semibold">v{x.versionNo}</span>{" "}
                    <span className="text-xs text-muted">{VERSION_STATUS_LABELS[x.status]}</span>
                    {x.aiCheckFailed && <span className="ml-1 text-xs text-amber-700">AI 未実施</span>}
                    <span className="block truncate text-xs text-muted">{x.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section>
            <h2 className="mb-2 text-sm font-bold">審査の記録</h2>
            <ol className="space-y-2 border-l-2 border-border pl-3 text-xs">
              {history.logs.map((log) => (
                <li key={String(log.id)}>
                  <p className="font-semibold">
                    {AUDIT_ACTION_LABELS[log.action]}
                    {log.versionId && versionNoById.has(log.versionId) && ` v${versionNoById.get(log.versionId)}`}
                  </p>
                  <p className="text-muted">
                    {formatDateTime(log.createdAt)}・{log.actorType === "system" ? "システム" : (log.actor?.name ?? log.actor?.email)}
                  </p>
                  {log.reason && <p className="mt-0.5 whitespace-pre-wrap">理由：{log.reason}</p>}
                </li>
              ))}
            </ol>
          </section>
        </aside>

        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-border bg-surface p-5">
            <h2 className="font-bold">
              v{selected.versionNo}（{VERSION_STATUS_LABELS[selected.status]}）
            </h2>
            <p className="mt-1 text-xs text-muted">
              申請 {formatDateTime(selected.submittedAt)}
              {selected.decidedAt && ` ・ 判断 ${formatDateTime(selected.decidedAt)}（${selected.decider?.name ?? "システム"}）`}
            </p>
            {selected.rejectReason && (
              <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm whitespace-pre-wrap text-red-900">差し戻しの理由：{selected.rejectReason}</p>
            )}
            <div className="mt-4">
              {previous ? (
                <DiffView before={previous} after={selected} beforeLabel={`v${previous.versionNo}`} afterLabel={`v${selected.versionNo}`} />
              ) : (
                <p className="text-sm text-muted">最初の版のため、比較する版はありません。</p>
              )}
            </div>
          </section>
          <section className="rounded-xl border border-border bg-surface px-5 py-6 sm:px-8">
            <h2 className="mb-4 border-b border-border pb-2 font-bold">{selected.title}</h2>
            {/* renderMarkdown はサニタイズ済みの HTML だけを返す */}
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
          </section>
        </div>
      </div>
    </div>
  );
}
