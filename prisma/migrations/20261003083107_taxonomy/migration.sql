-- CreateEnum
CREATE TYPE "ArticleCategory" AS ENUM ('dev', 'infra', 'career');

-- AlterTable
ALTER TABLE "article_versions" ADD COLUMN     "category" "ArticleCategory",
ADD COLUMN     "facets" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "article_versions_facets_idx" ON "article_versions" USING GIN ("facets");

-- CreateIndex
CREATE INDEX "article_versions_category_idx" ON "article_versions"("category");

-- 既存の版は、著者の部署を大分類とする（分類の導入前に書かれた記事のため。属性は空のまま）
UPDATE "article_versions" v SET "category" = u."department"::text::"ArticleCategory"
  FROM "users" u WHERE u."id" = v."created_by" AND u."department" IS NOT NULL;

-- 審査に出した版は、大分類と属性も変更できない（分類も審査の対象のため）
CREATE OR REPLACE FUNCTION article_versions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'article_versions: cannot delete a % version', OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft'        AND NEW.status = 'ai_review') OR
    (OLD.status = 'ai_review'    AND NEW.status IN ('admin_review', 'rejected')) OR
    (OLD.status = 'admin_review' AND NEW.status IN ('published', 'rejected')) OR
    (OLD.status = 'published'    AND NEW.status = 'superseded')
  ) THEN
    RAISE EXCEPTION 'article_versions: invalid status transition % -> %', OLD.status, NEW.status;
  END IF;

  IF OLD.status <> 'draft' AND (
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW.body_md IS DISTINCT FROM OLD.body_md OR
    NEW.show_initials IS DISTINCT FROM OLD.show_initials OR
    NEW.category IS DISTINCT FROM OLD.category OR
    NEW.facets IS DISTINCT FROM OLD.facets OR
    NEW.article_id IS DISTINCT FROM OLD.article_id OR
    NEW.version_no IS DISTINCT FROM OLD.version_no OR
    NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'article_versions: a submitted version is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
