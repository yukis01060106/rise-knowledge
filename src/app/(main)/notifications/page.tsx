import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { listNotifications } from "@/server/insights/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatDateTime } from "@/lib/format";
import { monthLabel } from "@/lib/month";
import { MarkReadOnView } from "./mark-read";
import type { NotificationType } from "@/generated/prisma/enums";

type Payload = { title?: string; actorName?: string | null; reason?: string | null; month?: string };

const VIEW: Record<NotificationType, { icon: string; tone: string; text: (p: Payload) => string; href: (articleId: string | null) => string }> = {
  approved: { icon: "🎉", tone: "bg-emerald-50", text: (p) => `「${p.title}」が承認され、公開されました`, href: (a) => `/articles/${a}` },
  rejected: { icon: "↩", tone: "bg-red-50", text: (p) => `「${p.title}」が差し戻されました`, href: (a) => `/articles/${a}/edit` },
  auto_rejected: { icon: "🤖", tone: "bg-red-50", text: (p) => `「${p.title}」は AI チェックで差し戻されました`, href: (a) => `/articles/${a}/edit` },
  liked: { icon: "♥", tone: "bg-pink-50 text-pink-600", text: (p) => `${p.actorName ?? "だれか"} さんが「${p.title}」にいいねしました`, href: (a) => `/articles/${a}` },
  commented: { icon: "💬", tone: "bg-sky-50", text: (p) => `${p.actorName ?? "だれか"} さんが「${p.title}」にコメントしました`, href: (a) => `/articles/${a}#comments-heading` },
  review_requested: { icon: "📝", tone: "bg-brand-soft", text: (p) => `「${p.title}」のレビュー待ちがあります`, href: () => "/admin/reviews" },
  comment_flagged: { icon: "⚠", tone: "bg-amber-50", text: (p) => `「${p.title}」に要確認のコメントがあります`, href: () => "/admin/comments" },
  award: { icon: "🏆", tone: "bg-amber-50", text: (p) => `「${p.title}」が${p.month ? monthLabel(p.month) : "今月"}のベスト記事に選ばれました！`, href: (a) => `/articles/${a}` },
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await listNotifications(user);
  const unread = items.some((n) => !n.readAt);

  return (
    <div className="mx-auto max-w-3xl">
      <MarkReadOnView hasUnread={unread} />
      <PageHeader title="通知" description="承認・差し戻し・いいね・コメントなど。直近 50 件" />
      {items.length > 0 ? (
        <ul className="card divide-y divide-border overflow-hidden">
          {items.map((n) => {
            const v = VIEW[n.type];
            const p = (n.payload ?? {}) as Payload;
            return (
              <li key={n.id}>
                <Link href={v.href(n.articleId)} className={`flex gap-3 px-5 py-4 hover:bg-background ${n.readAt ? "" : "bg-brand-soft/40"}`}>
                  <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-full text-base ${v.tone}`}>
                    {v.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {!n.readAt && <span className="mr-1.5 inline-block size-2 rounded-full bg-accent align-middle" aria-label="未読" />}
                      {v.text(p)}
                    </p>
                    {p.reason && <p className="mt-1 line-clamp-3 text-xs whitespace-pre-wrap text-muted">理由：{p.reason}</p>}
                    <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="通知はまだありません" />
      )}
    </div>
  );
}
