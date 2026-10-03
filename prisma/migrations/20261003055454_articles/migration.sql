-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('draft', 'ai_review', 'admin_review', 'published', 'rejected', 'superseded');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'version_created';

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "published_version_id" UUID,
    "first_published_at" TIMESTAMPTZ,
    "hidden_at" TIMESTAMPTZ,
    "hidden_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_versions" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "ai_check_failed" BOOLEAN NOT NULL DEFAULT false,
    "based_on_version_id" UUID,
    "created_by" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ,
    "decided_at" TIMESTAMPTZ,
    "decided_by" UUID,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "article_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_tags" (
    "version_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "version_tags_pkey" PRIMARY KEY ("version_id","tag_id")
);

-- CreateTable
CREATE TABLE "images" (
    "id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_published_version_id_key" ON "articles"("published_version_id");

-- CreateIndex
CREATE INDEX "articles_author_id_updated_at_idx" ON "articles"("author_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "article_versions_submitted_at_idx" ON "article_versions"("submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "article_versions_article_id_version_no_key" ON "article_versions"("article_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "version_tags_tag_id_version_id_idx" ON "version_tags"("tag_id", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "images_storage_key_key" ON "images"("storage_key");

-- CreateIndex
CREATE INDEX "images_uploader_id_created_at_idx" ON "images"("uploader_id", "created_at");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "article_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_based_on_version_id_fkey" FOREIGN KEY ("based_on_version_id") REFERENCES "article_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_versions" ADD CONSTRAINT "article_versions_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_tags" ADD CONSTRAINT "version_tags_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "article_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version_tags" ADD CONSTRAINT "version_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ここから下は Prisma スキーマで表せない定義（docs/design/database.md「主要なインデックス」）

-- 日本語の全文検索（2-gram）
CREATE EXTENSION IF NOT EXISTS pg_bigm;

-- 作業中の版（draft / ai_review / admin_review / rejected）は 1 記事につき 1 つまで
CREATE UNIQUE INDEX "article_versions_one_working_per_article"
  ON "article_versions"("article_id")
  WHERE status IN ('draft', 'ai_review', 'admin_review', 'rejected');

-- レビュー待ち一覧（申請日時順）
CREATE INDEX "article_versions_admin_review_submitted_at_idx"
  ON "article_versions"("submitted_at")
  WHERE status = 'admin_review';

-- 新着一覧（公開中かつ非公開化されていない記事）
CREATE INDEX "articles_new_arrivals_idx"
  ON "articles"("first_published_at" DESC)
  WHERE published_version_id IS NOT NULL AND hidden_at IS NULL;

CREATE INDEX "article_versions_title_bigm_idx" ON "article_versions" USING gin ("title" gin_bigm_ops);
CREATE INDEX "article_versions_body_md_bigm_idx" ON "article_versions" USING gin ("body_md" gin_bigm_ops);
CREATE INDEX "tags_name_bigm_idx" ON "tags" USING gin ("name" gin_bigm_ops);
