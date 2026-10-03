import { requireUser } from "@/server/auth/guards";
import { ArticleEditor } from "@/components/articles/article-editor";

export default async function NewArticlePage() {
  const user = await requireUser();
  return (
    <ArticleEditor
      articleId={null}
      initialTitle=""
      initialBody=""
      initialTags={[]}
      initialUpdatedAt={null}
      editingPublished={false}
      rejection={null}
      initialShowInitials={false}
      myInitials={user.initials}
    />
  );
}
