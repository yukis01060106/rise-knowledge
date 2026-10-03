import Link from "next/link";
import type { ArticleCard } from "@/server/articles/queries";
import { Avatar } from "@/components/ui/avatar";
import { DepartmentBadge } from "@/components/ui/department-badge";
import { TagChip } from "@/components/ui/tag-chip";
import { formatDate } from "@/lib/format";

export function ArticleList({ articles }: { articles: ArticleCard[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
      {articles.map((a) => (
        <li key={a.id} className="flex gap-3 px-4 py-4 sm:px-5">
          <Avatar name={a.author.name} department={a.author.department} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span className="font-medium text-foreground">{a.author.name ?? "名前未設定"}</span>
              <DepartmentBadge department={a.author.department} />
              <span>{formatDate(a.firstPublishedAt)}</span>
            </div>
            <Link href={`/articles/${a.id}`} className="mt-1 block text-lg leading-snug font-bold hover:text-brand">
              {a.title}
            </Link>
            {a.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.tags.map((t) => (
                  <TagChip key={t.name} {...t} />
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
