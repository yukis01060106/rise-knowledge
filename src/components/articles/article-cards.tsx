import Link from "next/link";
import type { ArticleCard } from "@/server/articles/queries";
import { Avatar } from "@/components/ui/avatar";
import { CategoryBadge } from "@/components/ui/category-badge";
import { DepartmentBadge } from "@/components/ui/department-badge";
import { formatDate } from "@/lib/format";

function Meta({ a }: { a: ArticleCard }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <Avatar name={a.author.name} department={a.author.department} size="sm" />
      <span className="font-medium text-foreground">{a.author.name}</span>
      <DepartmentBadge department={a.author.department} />
      <span className="ml-auto shrink-0">
        {formatDate(a.firstPublishedAt)} ・ {a.readingMinutes} 分
      </span>
    </div>
  );
}

function Chips({ a, max = 4 }: { a: ArticleCard; max?: number }) {
  const facets = a.facets.slice(0, max);
  const tags = a.tags.slice(0, Math.max(0, max - facets.length));
  if (facets.length + tags.length === 0) return null;
  return (
    <div className={`cat-${a.category ?? "dev"} flex flex-wrap gap-1.5`}>
      {facets.map((f) => (
        <span key={f.key} className="cat-soft rounded-md px-2 py-0.5 text-xs font-medium">
          {f.label}
        </span>
      ))}
      {tags.map((t) => (
        <span key={t.name} className="rounded-md bg-background px-2 py-0.5 text-xs text-muted">
          #{t.displayName}
        </span>
      ))}
    </div>
  );
}

/** 記事カードの一覧。リンクはカード全体（中のタグは飾りで、タグ別一覧へは記事ページから行く） */
export function ArticleCards({ articles, columns = 1 }: { articles: ArticleCard[]; columns?: 1 | 2 }) {
  return (
    <ul className={`grid gap-4 ${columns === 2 ? "md:grid-cols-2" : ""}`}>
      {articles.map((a) => (
        <li key={a.id}>
          <Link href={`/articles/${a.id}`} className="card group flex h-full flex-col gap-3 overflow-hidden p-5">
            <div className="flex items-center gap-2">
              <CategoryBadge category={a.category} />
            </div>
            <h3 className="text-lg leading-snug font-bold group-hover:text-brand">{a.title}</h3>
            {a.excerpt && <p className="line-clamp-2 text-sm leading-relaxed text-muted">{a.excerpt}</p>}
            <Chips a={a} />
            <div className="mt-auto pt-1">
              <Meta a={a} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** トップの注目記事（いちばん新しい記事を大きく見せる） */
export function FeaturedArticle({ a }: { a: ArticleCard }) {
  return (
    <Link
      href={`/articles/${a.id}`}
      className={`cat-${a.category ?? "dev"} card group relative flex flex-col gap-4 overflow-hidden p-6 sm:p-8`}
    >
      <span aria-hidden className="cat-gradient absolute inset-x-0 top-0 h-1.5" />
      <span aria-hidden className="cat-gradient absolute -top-24 -right-24 size-56 rounded-full opacity-10" />
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-foreground px-2.5 py-0.5 text-xs font-bold text-white">NEW</span>
        <CategoryBadge category={a.category} />
      </div>
      <h3 className="text-2xl leading-snug font-bold group-hover:text-brand sm:text-3xl">{a.title}</h3>
      {a.excerpt && <p className="line-clamp-3 leading-relaxed text-muted">{a.excerpt}</p>}
      <Chips a={a} max={6} />
      <Meta a={a} />
    </Link>
  );
}
