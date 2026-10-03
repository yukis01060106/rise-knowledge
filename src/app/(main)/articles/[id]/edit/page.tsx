import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { getArticleForEdit } from "@/server/articles/queries";
import { ArticleEditor } from "@/components/articles/article-editor";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClass } from "@/components/ui/button";
import { VERSION_STATUS_LABELS } from "@/lib/labels";

export default async function EditArticlePage({ params }: PageProps<"/articles/[id]/edit">) {
  const user = await requireUser();
  const article = await getArticleForEdit(user, (await params).id);
  if (!article) notFound();

  const { working, published } = article;

  // 審査に出した版は変更しない（差し戻しへの対応はレビュー機能とあわせて追加する）
  if (working && working.status !== "draft") {
    return (
      <EmptyState title={`この記事は「${VERSION_STATUS_LABELS[working.status]}」のため編集できません`}>
        <Link href={`/articles/${article.id}`} className={buttonClass("secondary", "sm", "mt-3")}>
          記事ページへ
        </Link>
      </EmptyState>
    );
  }

  // 作業中の版があればそれを、なければ公開中の版を下敷きにする（保存すると新しい版になる）
  const source = working ?? published;
  if (!source) notFound();

  return (
    <ArticleEditor
      articleId={article.id}
      initialTitle={source.title}
      initialBody={source.bodyMd}
      initialTags={source.tags.map((t) => t.displayName)}
      initialUpdatedAt={working ? working.updatedAt.toISOString() : null}
      editingPublished={!working && published !== null}
    />
  );
}
