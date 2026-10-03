import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { monthlyRanking } from "@/server/insights/queries";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AwardBadge } from "@/components/articles/article-cards";
import { addMonths, isMonth, monthLabel, monthOf } from "@/lib/month";
import { AwardForm } from "./award-form";

export default async function AwardsPage({ searchParams }: PageProps<"/admin/awards">) {
  await requireAdmin();
  const sp = await searchParams;
  const current = monthOf(new Date());
  const month = isMonth(sp.month) && sp.month <= current ? sp.month : current;
  const { articles, award } = await monthlyRanking(month);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="月間ベストの表彰"
        description="その月のいいねランキングから 1 本を選びます。表彰は監査ログに残り、著者に通知されます。"
        actions={
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/admin/awards?month=${addMonths(month, -1)}`} className="rounded-md px-2 py-1 hover:bg-surface">
              ←
            </Link>
            <span className="font-semibold">{monthLabel(month)}</span>
            {month < current && (
              <Link href={`/admin/awards?month=${addMonths(month, 1)}`} className="rounded-md px-2 py-1 hover:bg-surface">
                →
              </Link>
            )}
          </div>
        }
      />
      {award && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {monthLabel(month)}はすでに表彰済みです。{award.comment && `「${award.comment}」`}
        </p>
      )}
      {articles.length > 0 ? (
        <ol className="space-y-3">
          {articles.map((a, i) => (
            <li key={a.id} className="card space-y-3 p-4">
              <div className="flex items-center gap-3">
                <span className="brand-text w-8 text-center text-xl font-bold">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/articles/${a.id}`} className="font-bold hover:text-brand">
                    {a.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {a.author.name} ・ この月のいいね {a.monthLikes}
                  </p>
                </div>
                {award?.articleId === a.id && <AwardBadge month={month} />}
              </div>
              {!award && <AwardForm month={month} articleId={a.id} />}
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState title="この月はまだいいねがありません" />
      )}
    </div>
  );
}
