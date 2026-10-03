import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { countByCategory, countFacets, listPublishedArticles } from "@/server/articles/queries";
import { ArticleCards } from "@/components/articles/article-cards";
import { CategoryIcon } from "@/components/ui/category-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, parsePage } from "@/components/ui/pagination";
import { CATEGORIES, categoryOf, describeFacets, groupsFor, facetKey, isCategoryKey, type CategoryKey } from "@/lib/taxonomy";

function href(cat: CategoryKey | undefined, facets: string[]) {
  const sp = new URLSearchParams();
  if (cat) sp.set("cat", cat);
  for (const f of facets) sp.append("f", f);
  const qs = sp.toString();
  return qs ? `/articles?${qs}` : "/articles";
}

export default async function ArticlesPage({ searchParams }: PageProps<"/articles">) {
  await requireUser();
  const sp = await searchParams;
  const category = isCategoryKey(sp.cat) ? sp.cat : undefined;
  const rawFacets = (Array.isArray(sp.f) ? sp.f : sp.f ? [sp.f] : []).slice(0, 20);
  // 大分類で選べない属性は URL に残っていても無視する
  const selected = category ? describeFacets(category, rawFacets).map((f) => f.key) : [];
  const [result, byCategory, facetCounts] = await Promise.all([
    listPublishedArticles({ category, facets: selected, page: parsePage(sp.page) }),
    countByCategory(),
    category ? countFacets(category) : Promise.resolve<Record<string, number>>({}),
  ]);
  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
  const current = categoryOf(category);
  const selectedLabels = category ? describeFacets(category, selected) : [];

  return (
    <div className="space-y-6">
      <header className={`${current ? `cat-${current.key} cat-gradient text-white` : "brand-gradient text-white"} relative overflow-hidden rounded-3xl px-6 py-7 sm:px-8`}>
        <span aria-hidden className="orbit orbit-spin -top-24 -right-16 size-72 border-t-white/50 border-r-transparent" />
        <p className="relative text-sm text-white/80">記事</p>
        <h1 className="relative mt-1 text-2xl font-bold sm:text-3xl">{current ? current.label : "すべての記事"}</h1>
        <p className="relative mt-1 text-sm text-white/85">{current ? current.description : "分類と属性をかけ合わせて、読みたい記事を探せます。"}</p>
      </header>

      {/* 大分類 */}
      <nav aria-label="大分類" className="flex flex-wrap gap-2">
        <Link
          href="/articles"
          aria-current={!category ? "page" : undefined}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${!category ? "bg-foreground text-white" : "bg-surface text-muted ring-1 ring-border hover:text-foreground"}`}
        >
          すべて <span className="ml-1 opacity-70">{total}</span>
        </Link>
        {CATEGORIES.map((c) => {
          const active = c.key === category;
          return (
            <Link
              key={c.key}
              href={href(c.key, [])}
              aria-current={active ? "page" : undefined}
              className={`cat-${c.key} inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                active ? "cat-gradient text-white shadow" : "bg-surface ring-1 ring-border hover:ring-[var(--cat-from)]"
              }`}
            >
              <CategoryIcon category={c.key} className={`size-4 ${active ? "" : "cat-ink"}`} />
              {c.label}
              <span className="opacity-70">{byCategory[c.key]}</span>
            </Link>
          );
        })}
      </nav>

      <div className={category ? "grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]" : ""}>
        {category && (
          <aside aria-label="属性で絞り込み" className={`cat-${category} card h-fit space-y-5 p-4 lg:sticky lg:top-20`}>
            {groupsFor(category).map((g) => (
              <div key={g.key}>
                <p className="mb-2 text-xs font-bold tracking-wide text-muted">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.options
                    .filter((o) => !o.hidden)
                    .map((o) => {
                      const key = facetKey(g.key, o.key);
                      const on = selected.includes(key);
                      const next = on ? selected.filter((x) => x !== key) : [...selected, key];
                      const count = facetCounts[key] ?? 0;
                      return (
                        <Link
                          key={key}
                          href={href(category, next)}
                          aria-pressed={on}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            on ? "cat-gradient text-white shadow-sm" : count > 0 ? "cat-soft hover:brightness-95" : "bg-background text-gray-400"
                          }`}
                        >
                          {o.label}
                          <span className="ml-1 opacity-70">{count}</span>
                        </Link>
                      );
                    })}
                </div>
              </div>
            ))}
          </aside>
        )}

        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{result.total} 件</span>
            {selectedLabels.map((f) => (
              <Link
                key={f.key}
                href={href(category, selected.filter((x) => x !== f.key))}
                className={`cat-${category} cat-soft inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium`}
              >
                {f.groupLabel}：{f.label} <span aria-label="条件を外す">×</span>
              </Link>
            ))}
            {selectedLabels.length > 0 && (
              <Link href={href(category, [])} className="text-xs text-muted underline">
                条件をクリア
              </Link>
            )}
          </div>
          {result.items.length > 0 ? (
            <ArticleCards articles={result.items} columns={category ? 1 : 2} />
          ) : (
            <EmptyState title="条件に合う記事はまだありません">条件を減らすか、この分野の記事を書いてみませんか？</EmptyState>
          )}
          <Pagination page={result.page} pageCount={result.pageCount} basePath="/articles" params={{ cat: category, f: selected }} />
        </section>
      </div>
    </div>
  );
}
