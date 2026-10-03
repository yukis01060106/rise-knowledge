import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { monthlyRanking } from "@/server/insights/queries";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge } from "@/components/ui/category-badge";
import { DepartmentBadge } from "@/components/ui/department-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AwardBadge } from "@/components/articles/article-cards";
import { addMonths, isMonth, monthLabel, monthOf } from "@/lib/month";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function RankingsPage({ searchParams }: PageProps<"/rankings">) {
  await requireUser();
  const sp = await searchParams;
  const current = monthOf(new Date());
  const month = isMonth(sp.month) && sp.month <= current ? sp.month : current;
  const { articles, authors, award } = await monthlyRanking(month);

  return (
    <div className="space-y-6">
      <header className="brand-gradient relative overflow-hidden rounded-3xl px-6 py-7 text-white sm:px-8">
        <span aria-hidden className="orbit orbit-spin -top-24 -right-16 size-72 border-t-white/50 border-r-transparent" />
        <p className="relative text-sm text-white/80">月間ランキング</p>
        <div className="relative mt-1 flex flex-wrap items-center gap-3">
          <Link href={`/rankings?month=${addMonths(month, -1)}`} className="rounded-full bg-white/15 px-3 py-1 text-sm ring-1 ring-white/40 hover:bg-white/25" aria-label="前の月">
            ←
          </Link>
          <h1 className="text-2xl font-bold sm:text-3xl">{monthLabel(month)}</h1>
          {month < current && (
            <Link href={`/rankings?month=${addMonths(month, 1)}`} className="rounded-full bg-white/15 px-3 py-1 text-sm ring-1 ring-white/40 hover:bg-white/25" aria-label="次の月">
              →
            </Link>
          )}
        </div>
        <p className="relative mt-1 text-sm text-white/85">その月についた「いいね」の数で並べています。</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-3">
          <h2 className="text-lg font-bold">記事ランキング</h2>
          {articles.length > 0 ? (
            <ol className="space-y-3">
              {articles.map((a, i) => (
                <li key={a.id}>
                  <Link
                    href={`/articles/${a.id}`}
                    className={`card flex items-center gap-4 p-4 ${award?.articleId === a.id ? "ring-2 ring-amber-400" : ""}`}
                  >
                    <span className={`w-10 shrink-0 text-center font-bold ${i < 3 ? "text-3xl" : "brand-text text-xl"}`}>{MEDALS[i] ?? i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CategoryBadge category={a.category} />
                        {award?.articleId === a.id && <AwardBadge month={month} />}
                      </div>
                      <p className="mt-1 font-bold">{a.title}</p>
                      <p className="mt-0.5 text-xs text-muted">{a.author.name}</p>
                    </div>
                    <span className="shrink-0 text-lg font-bold text-pink-600">♥ {a.monthLikes}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="この月のいいねはまだありません" />
          )}
        </section>

        <aside className="space-y-3">
          <h2 className="text-lg font-bold">投稿者ランキング</h2>
          {authors.length > 0 ? (
            <ol className="card divide-y divide-border overflow-hidden">
              {authors.map((u, i) => (
                <li key={u.id}>
                  <Link href={`/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-background">
                    <span className="w-6 text-center font-bold">{MEDALS[i] ?? i + 1}</span>
                    <Avatar name={u.name} department={u.department} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{u.name ?? "名前未設定"}</p>
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <DepartmentBadge department={u.department} /> 投稿 {u.posts}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-pink-600">♥ {u.monthLikes}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="まだいません" />
          )}
          <p className="text-xs text-muted">※ イニシャル表示の記事は、投稿者ランキングには数えません。</p>
        </aside>
      </div>
    </div>
  );
}
