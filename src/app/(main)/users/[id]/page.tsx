import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { getUserProfile } from "@/server/social/queries";
import { ArticleCards } from "@/components/articles/article-cards";
import { Avatar } from "@/components/ui/avatar";
import { DepartmentBadge } from "@/components/ui/department-badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function UserPage({ params }: PageProps<"/users/[id]">) {
  const viewer = await requireUser();
  const profile = await getUserProfile((await params).id);
  if (!profile) notFound();
  const { user, articles, likeTotal } = profile;
  const isMe = viewer.id === user.id;

  return (
    <div className="space-y-6">
      <header className="card relative overflow-hidden p-6 sm:p-8">
        <span aria-hidden className="brand-gradient absolute inset-x-0 top-0 h-20 opacity-90" />
        <div className="relative flex flex-wrap items-end gap-4 pt-8">
          <span className="rounded-full bg-white p-1 shadow">
            <Avatar name={user.name} department={user.department} size="lg" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{user.name ?? "名前未設定"}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted">
              <DepartmentBadge department={user.department} />
              {user.disabledAt && <span className="text-xs">（利用終了）</span>}
            </p>
          </div>
          <dl className="flex gap-6 text-center">
            <div>
              <dd className="text-2xl font-bold">{articles.length}</dd>
              <dt className="text-xs text-muted">記事</dt>
            </div>
            <div>
              <dd className="text-2xl font-bold text-pink-600">{likeTotal}</dd>
              <dt className="text-xs text-muted">いいね</dt>
            </div>
          </dl>
        </div>
        {isMe && (
          <p className="relative mt-4 rounded-lg bg-background px-3 py-2 text-xs text-muted">
            イニシャル表示で投稿した記事は、ここには表示されません（あなたの名前とひもづかないようにするため）。
          </p>
        )}
      </header>
      {articles.length > 0 ? <ArticleCards articles={articles} columns={2} /> : <EmptyState title="公開中の記事はまだありません" />}
    </div>
  );
}
