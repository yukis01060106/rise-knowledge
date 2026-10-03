-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'draft_discarded';
ALTER TYPE "AuditAction" ADD VALUE 'submitted';
ALTER TYPE "AuditAction" ADD VALUE 'ai_check_completed';
ALTER TYPE "AuditAction" ADD VALUE 'ai_check_failed';
ALTER TYPE "AuditAction" ADD VALUE 'auto_rejected';
ALTER TYPE "AuditAction" ADD VALUE 'approved';
ALTER TYPE "AuditAction" ADD VALUE 'rejected';
ALTER TYPE "AuditAction" ADD VALUE 'article_hidden';
ALTER TYPE "AuditAction" ADD VALUE 'article_unhidden';

-- ここから下は Prisma スキーマで表せない定義（docs/design/workflow.md）

-- 作業中の版（1 記事につき 1 つまで）から rejected を外す。
-- 差し戻された版はそのまま残し、著者が修正すると新しい draft 版を作るため
DROP INDEX "article_versions_one_working_per_article";
CREATE UNIQUE INDEX "article_versions_one_working_per_article"
  ON "article_versions"("article_id")
  WHERE status IN ('draft', 'ai_review', 'admin_review');

-- 版の保護（アプリのバグがあっても承認フローを迂回できないよう、DB でも止める）
--  1. 状態は決められた遷移しかできない（draft → published のような飛び越しは不可）
--  2. 審査に出した版（draft 以外）は内容を変更できない
--  3. draft 以外の版は削除できない
CREATE FUNCTION article_versions_guard() RETURNS trigger AS $$
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
    NEW.article_id IS DISTINCT FROM OLD.article_id OR
    NEW.version_no IS DISTINCT FROM OLD.version_no OR
    NEW.created_by IS DISTINCT FROM OLD.created_by
  ) THEN
    RAISE EXCEPTION 'article_versions: a submitted version is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER article_versions_guard
  BEFORE UPDATE OR DELETE ON "article_versions"
  FOR EACH ROW EXECUTE FUNCTION article_versions_guard();

-- 審査に出した版のタグも変更できない
CREATE FUNCTION version_tags_guard() RETURNS trigger AS $$
DECLARE
  v_status "VersionStatus";
BEGIN
  SELECT status INTO v_status FROM article_versions
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  -- 版ごと消える（draft の破棄）ときは、版が先に消えていて見つからない
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'version_tags: tags of a submitted version are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER version_tags_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "version_tags"
  FOR EACH ROW EXECUTE FUNCTION version_tags_guard();

-- アプリ用の DB ロール（app_user）があれば、監査ログは追記と参照だけにする。
-- ロールの作成と接続ユーザーの分離は本番準備（フェーズ7、docs/deploy.md）で行う
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM app_user;
    GRANT INSERT, SELECT ON "audit_logs" TO app_user;
  END IF;
END
$$;
