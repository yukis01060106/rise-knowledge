-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'award_given';

-- CreateTable
CREATE TABLE "monthly_awards" (
    "id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "article_id" UUID NOT NULL,
    "awarded_by" UUID NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monthly_awards_month_key" ON "monthly_awards"("month");

-- CreateIndex
CREATE INDEX "monthly_awards_article_id_idx" ON "monthly_awards"("article_id");

-- AddForeignKey
ALTER TABLE "monthly_awards" ADD CONSTRAINT "monthly_awards_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_awards" ADD CONSTRAINT "monthly_awards_awarded_by_fkey" FOREIGN KEY ("awarded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
