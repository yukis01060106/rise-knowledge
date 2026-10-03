-- DropIndex
DROP INDEX "article_versions_body_md_bigm_idx";

-- DropIndex
DROP INDEX "article_versions_title_bigm_idx";

-- pg_bigm のインデックスは LIKE にしか効かないため、英字の大文字・小文字を区別せずに検索できるよう
-- lower() の式インデックスにする（検索側も lower(...) LIKE likequery(lower(語)) で書く）
CREATE INDEX "article_versions_title_lower_bigm_idx" ON "article_versions" USING gin (lower("title") gin_bigm_ops);
CREATE INDEX "article_versions_body_md_lower_bigm_idx" ON "article_versions" USING gin (lower("body_md") gin_bigm_ops);
