-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('approved', 'rejected', 'auto_rejected', 'liked', 'commented', 'review_requested', 'comment_flagged', 'award');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "article_id" UUID,
    "payload" JSONB NOT NULL,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 未読通知（ヘッダーの件数）
CREATE INDEX "notifications_unread_idx" ON "notifications"("user_id", "created_at" DESC) WHERE read_at IS NULL;
