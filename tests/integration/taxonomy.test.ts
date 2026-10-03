import { beforeEach, describe, expect, it } from "vitest";
import { saveDraft } from "@/server/articles/actions";
import { countByCategory, countFacets, listPublishedArticles } from "@/server/articles/queries";
import { submitForReview } from "@/server/workflow";
import { prisma } from "@/server/db";
import { createUser, resetDb } from "../helpers/db";
import { loginAs } from "../helpers/auth";
import { createPublishedArticle, createUnpublishedArticle } from "../helpers/articles";

beforeEach(resetDb);

const draft = { articleId: null, title: "記事", bodyMd: "本文", tags: [] as string[], expectedUpdatedAt: null };

describe("記事の分類（大分類と属性）", () => {
  it("大分類と属性を保存する。属性は定義順にそろえる", async () => {
    const user = await createUser();
    loginAs(user);
    const saved = await saveDraft({ ...draft, category: "dev", facets: ["dev.lang:java", "kind:trouble"] });
    if (!saved.ok) throw new Error(saved.message);
    expect(await prisma.articleVersion.findUniqueOrThrow({ where: { id: saved.versionId } })).toMatchObject({
      category: "dev",
      facets: ["kind:trouble", "dev.lang:java"],
    });
  });

  it("大分類で選べない属性・存在しない属性は保存しない", async () => {
    const user = await createUser();
    loginAs(user);
    expect(await saveDraft({ ...draft, category: "dev", facets: ["infra.product:aws"] })).toMatchObject({ ok: false, code: "invalid" });
    expect(await saveDraft({ ...draft, category: "infra", facets: ["infra.product:nope"] })).toMatchObject({ ok: false });
    expect(await saveDraft({ ...draft, category: null, facets: ["kind:howto"] })).toMatchObject({ ok: false });
    expect(await prisma.article.count()).toBe(0);
  });

  it("大分類がないと申請できない（下書きでは未設定でよい）", async () => {
    const user = await createUser();
    const { articleId } = await createUnpublishedArticle(user.id, { category: null });
    expect(await submitForReview(user, articleId)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("審査に出した版の大分類・属性は変更できない（DB が拒否する）", async () => {
    const user = await createUser();
    const { versionId } = await createUnpublishedArticle(user.id, { status: "admin_review", facets: ["kind:howto"] });
    await expect(prisma.articleVersion.update({ where: { id: versionId }, data: { category: "infra" } })).rejects.toThrow(/immutable/);
    await expect(prisma.articleVersion.update({ where: { id: versionId }, data: { facets: [] } })).rejects.toThrow(/immutable/);
  });
});

describe("分類による絞り込み", () => {
  beforeEach(async () => {
    const u = await createUser();
    await createPublishedArticle(u.id, { title: "Java のテスト", category: "dev", facets: ["kind:howto", "dev.phase:test", "dev.lang:java"] });
    await createPublishedArticle(u.id, { title: "Python の実装", category: "dev", facets: ["dev.phase:implementation", "dev.lang:python"] });
    await createPublishedArticle(u.id, { title: "Java の実装", category: "dev", facets: ["dev.phase:implementation", "dev.lang:java"] });
    await createPublishedArticle(u.id, { title: "AWS の構築", category: "infra", facets: ["infra.product:aws"] });
    await createUnpublishedArticle(u.id, { title: "下書き", category: "dev", facets: ["dev.lang:java"] });
  });

  const titles = async (opts: Parameters<typeof listPublishedArticles>[0]) =>
    (await listPublishedArticles(opts)).items.map((a) => a.title).sort();

  it("大分類で絞り込む", async () => {
    expect(await titles({ category: "infra" })).toEqual(["AWS の構築"]);
    expect((await titles({ category: "dev" })).length).toBe(3);
  });

  it("同じ軸の中は「どれか」、軸どうしは「すべて」", async () => {
    expect(await titles({ category: "dev", facets: ["dev.lang:java", "dev.lang:python"] })).toEqual(["Java のテスト", "Java の実装", "Python の実装"]);
    expect(await titles({ category: "dev", facets: ["dev.lang:java", "dev.phase:implementation"] })).toEqual(["Java の実装"]);
  });

  it("ほかの大分類の属性が URL に残っていても無視する", async () => {
    expect(await titles({ category: "infra", facets: ["dev.lang:java"] })).toEqual(["AWS の構築"]);
  });

  it("大分類ごと・属性ごとの公開記事数（下書きは数えない）", async () => {
    expect(await countByCategory()).toEqual({ dev: 3, infra: 1, career: 0 });
    expect(await countFacets("dev")).toMatchObject({ "dev.lang:java": 2, "dev.lang:python": 1, "kind:howto": 1 });
  });
});
