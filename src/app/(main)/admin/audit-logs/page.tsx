import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { listAuditLogs, listUsersForFilter } from "@/server/articles/admin-queries";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { buttonClass } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { AUDIT_ACTION_LABELS } from "@/lib/labels";
import type { AuditAction } from "@/generated/prisma/enums";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const isDate = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function AuditLogsPage({ searchParams }: PageProps<"/admin/audit-logs">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const actionParam = one(sp.action);
  const filter = {
    action: actionParam && actionParam in AUDIT_ACTION_LABELS ? (actionParam as AuditAction) : undefined,
    actorId: one(sp.actor),
    articleId: one(sp.article),
    from: isDate(one(sp.from)),
    to: isDate(one(sp.to)),
  };
  const [result, users] = await Promise.all([
    listAuditLogs(admin, { ...filter, page: parsePage(sp.page) }),
    listUsersForFilter(admin),
  ]);
  const field = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm";

  return (
    <div>
      <PageHeader title="監査ログ" description={`記録は追記のみで、変更・削除できません。${result.total} 件`} />
      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">操作</span>
          <select name="action" defaultValue={filter.action ?? ""} className={field}>
            <option value="">すべて</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">操作者</span>
          <select name="actor" defaultValue={filter.actorId ?? ""} className={field}>
            <option value="">すべて</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">記事 ID</span>
          <input name="article" defaultValue={filter.articleId ?? ""} placeholder="uuid" className={`${field} w-72 font-mono`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">期間（開始）</span>
          <input type="date" name="from" defaultValue={filter.from ?? ""} className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">期間（終了）</span>
          <input type="date" name="to" defaultValue={filter.to ?? ""} className={field} />
        </label>
        <button type="submit" className={buttonClass("primary", "sm", "py-1.5")}>
          絞り込む
        </button>
        <Link href="/admin/audit-logs" className={buttonClass("ghost", "sm", "py-1.5")}>
          クリア
        </Link>
      </form>

      {result.items.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-background text-left text-xs text-muted">
                <th className="px-3 py-2">日時</th>
                <th className="px-3 py-2">操作</th>
                <th className="px-3 py-2">操作者</th>
                <th className="px-3 py-2">対象</th>
                <th className="px-3 py-2">理由・詳細</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((log) => (
                <tr key={String(log.id)} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-muted">{formatDateTime(log.createdAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{AUDIT_ACTION_LABELS[log.action]}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {log.actorType === "system" ? <span className="text-muted">システム</span> : (log.actor?.name ?? log.actor?.email)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {log.articleId && (
                      <Link href={`/admin/articles/${log.articleId}/versions`} className="font-mono text-brand hover:underline">
                        記事 {log.articleId.slice(0, 8)}
                      </Link>
                    )}
                    {log.targetUser && <span>{log.targetUser.name ?? log.targetUser.email}</span>}
                  </td>
                  <td className="max-w-md px-3 py-2 text-xs">
                    {log.reason && <p className="whitespace-pre-wrap">{log.reason}</p>}
                    {log.metadata !== null && (
                      <code className="mt-0.5 block break-all text-muted">{JSON.stringify(log.metadata)}</code>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="該当する記録はありません" />
      )}
      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath="/admin/audit-logs"
        params={{ action: filter.action, actor: filter.actorId, article: filter.articleId, from: filter.from, to: filter.to }}
      />
    </div>
  );
}
