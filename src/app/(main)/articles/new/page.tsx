import { requireUser } from "@/server/auth/guards";
import { ArticleEditor } from "@/components/articles/article-editor";

export default async function NewArticlePage() {
  await requireUser();
  return (
    <ArticleEditor
      articleId={null}
      initialTitle=""
      initialBody=""
      initialTags={[]}
      initialUpdatedAt={null}
      editingPublished={false}
    />
  );
}
