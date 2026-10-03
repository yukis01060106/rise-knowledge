-- アプリ用の DB ロール（app_user）を作る。DB のオーナー（マイグレーションを流すロール）で、マイグレーションの後に 1 回実行する。
--   psql "$OWNER_DATABASE_URL" -v app_role=app_user -v app_password='...' -f scripts/sql/app-role.sql
-- アプリ・ワーカーは app_user で接続する（DATABASE_URL）。マイグレーションはオーナーで流す（docs/deploy.md）。
-- パスワードはここに書かない。-v で渡す。

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_role', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') \gexec

GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_role";
GRANT USAGE ON SCHEMA public TO :"app_role";

-- 通常のテーブルは読み書きできる
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_role";
-- 今後のマイグレーションで増えるテーブルにも同じ権限を付ける
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_role";

-- 監査ログは追記と参照だけ（トリガーでも拒否しているが、権限でも止める）
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM :"app_role";
GRANT SELECT, INSERT ON audit_logs TO :"app_role";

-- マイグレーションの管理表はアプリから触らせない
REVOKE ALL ON _prisma_migrations FROM :"app_role";

-- ジョブキュー（pg-boss）は app_user が自分のスキーマとして作る
SELECT format('CREATE SCHEMA IF NOT EXISTS pgboss AUTHORIZATION %I', :'app_role') \gexec
