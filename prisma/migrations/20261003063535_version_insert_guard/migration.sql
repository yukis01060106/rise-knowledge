-- 新しい版はかならず draft で作る（published などをいきなり INSERT して承認フローを迂回させない）
CREATE FUNCTION article_versions_insert_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'article_versions: a new version must be a draft (got %)', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER article_versions_insert_guard
  BEFORE INSERT ON "article_versions"
  FOR EACH ROW EXECUTE FUNCTION article_versions_insert_guard();
