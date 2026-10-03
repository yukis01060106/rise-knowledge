import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { listFlaggedComments } from "@/server/social/queries";
import { RiskBadge } from "@/components/articles/compliance-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/format";
import { CommentActions } from "./comment-actions";

export default async function FlaggedCommentsPage() {
  const admin = await requireAdmin();
  const items = await listFlaggedComments(admin);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="要確認コメント" description="AI チェックで medium と判定された、または AI チェックに失敗したコメント。表示されたまま確認待ちになっています。" />
      {items.length > 0 ? (
        <ul className="space-y-4">
          {items.map((c) => (
            <li key={c.id} className="card space-y-3 p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {c.check?.status === "succeeded" ? <RiskBadge level={c.check.riskLevel} /> : <span className="rounded bg-amber-100 px-1.5 font-semibold text-amber-900">AI チェック未実施</span>}
                <span className="font-semibold text-foreground">{c.authorName}</span>
                <span>{formatDateTime(c.createdAt)}</span>
                <Link href={`/articles/${c.articleId}`} className="text-brand hover:underline">
                  記事：{c.articleTitle}
                </Link>
              </div>
              {c.check?.summary && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">AI：{c.check.summary}</p>}
              {/* サニタイズ済みの HTML */}
              <div className="markdown-body rounded-xl bg-background px-4 py-3 text-sm" dangerouslySetInnerHTML={{ __html: c.html }} />
              <CommentActions id={c.id} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="要確認のコメントはありません" />
      )}
    </div>
  );
}
