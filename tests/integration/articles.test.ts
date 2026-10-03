import { beforeEach, describe, expect, it } from "vitest";
import { saveDraft } from "@/server/articles/actions";
import {
  getArticleDetail,
  getArticleForEdit,
  listMyArticles,
  listPublishedArticles,
  listTags,
} from "@/server/articles/queries";
import { prisma } from "@/server/db";
import { createUser, resetDb } from "../helpers/db";
import { expectRedirect, loginAs } from "../helpers/auth";
import { createPublishedArticle, createUnpublishedArticle } from "../helpers/articles";

beforeEach(resetDb);

const newDraft = { articleId: null, title: "はじめての記事", bodyMd: "本文です", tags: [] as string[], expectedUpdatedAt: null };

describe("下書きの保存（saveDraft）", () => {
  it("未ログインでは保存できない", async () => {
    loginAs(null);
    await expectRedirect(saveDraft(newDraft), "/login");
    expect(await prisma.article.count()).toBe(0);
  });

  it("新規作成：記事と v1 の下書きを作り、タグを正規化し、監査ログを残す", async () => {
    const user = await createUser();
    loginAs(user);

    const result = await saveDraft({ ...newDraft, tags: ["ＡＷＳ Terraform、aws"] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const version = await prisma.articleVersion.findUniqueOrThrow({
      where: { id: result.versionId },
      include: { tags: { include: { tag: true } }, article: true },
    });
    expect(version).toMatchObject({ versionNo: 1, status: "draft", title: "はじめての記事", createdBy: user.id });
    expect(version.article).toMatchObject({ authorId: user.id, publishedVersionId: null });
    // 全角は半角に、大文字小文字の違いは同じタグとして扱う
    expect(version.tags.map((t) => t.tag.name).sort()).toEqual(["aws", "terraform"]);

    const logs = await prisma.auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "version_created", actorId: user.id, articleId: result.articleId });
    // 監査ログに本文を入れない
    expect(JSON.stringify(logs[0].metadata)).not.toContain("本文です");
  });

  it("自分の下書きは同じ版を上書きする（版は増えない）", async () => {
    const user = await createUser();
    loginAs(user);
    const first = await saveDraft(newDraft);
    if (!first.ok) throw new Error(first.message);

    const second = await saveDraft({
      ...newDraft,
      articleId: first.articleId,
      title: "直したタイトル",
      tags: ["Linux"],
      expectedUpdatedAt: first.updatedAt,
    });
    expect(second).toMatchObject({ ok: true, versionId: first.versionId, versionNo: 1 });
    expect(await prisma.articleVersion.count()).toBe(1);
    expect((await prisma.articleVersion.findUniqueOrThrow({ where: { id: first.versionId } })).title).toBe("直したタイトル");
    // 上書き保存では監査ログを増やさない（版を作ったときだけ残す）
    expect(await prisma.auditLog.count()).toBe(1);
  });

  it("別の画面で先に保存されていたら上書きしない", async () => {
    const user = await createUser();
    loginAs(user);
    const first = await saveDraft(newDraft);
    if (!first.ok) throw new Error(first.message);
    const tabA = await saveDraft({ ...newDraft, articleId: first.articleId, title: "A", expectedUpdatedAt: first.updatedAt });
    expect(tabA.ok).toBe(true);

    const tabB = await saveDraft({ ...newDraft, articleId: first.articleId, title: "B", expectedUpdatedAt: first.updatedAt });
    expect(tabB).toMatchObject({ ok: false, code: "conflict" });
    expect((await prisma.articleVersion.findUniqueOrThrow({ where: { id: first.versionId } })).title).toBe("A");
  });

  it("他人の記事は保存できず、存在も知らせない", async () => {
    const author = await createUser();
    const other = await createUser({ role: "admin" });
    const { articleId, versionId } = await createUnpublishedArticle(author.id, { title: "元のタイトル" });
    loginAs(other);

    const result = await saveDraft({ ...newDraft, articleId, title: "乗っ取り" });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect((await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId } })).title).toBe("元のタイトル");
  });

  it("公開済みの記事を編集すると新しい版を作り、公開中の版はそのまま表示し続ける", async () => {
    const author = await createUser();
    const reader = await createUser();
    const { articleId, versionId: publishedId } = await createPublishedArticle(author.id, { title: "公開中のタイトル" });
    loginAs(author);

    const result = await saveDraft({ ...newDraft, articleId, title: "編集中のタイトル" });
    expect(result).toMatchObject({ ok: true, versionNo: 2 });
    if (!result.ok) return;
    const v2 = await prisma.articleVersion.findUniqueOrThrow({ where: { id: result.versionId } });
    expect(v2).toMatchObject({ status: "draft", basedOnVersionId: publishedId });

    // 2 回目の保存は同じ v2 を上書きする
    const again = await saveDraft({ ...newDraft, articleId, title: "さらに編集", expectedUpdatedAt: result.updatedAt });
    expect(again).toMatchObject({ ok: true, versionId: result.versionId });

    // ほかの人には公開中の版だけが見え、編集中の版は見えない
    const forReader = await getArticleDetail(reader, articleId);
    expect(forReader?.published?.title).toBe("公開中のタイトル");
    expect(forReader?.working).toBeNull();
    const list = await listPublishedArticles();
    expect(list.items.map((a) => a.title)).toEqual(["公開中のタイトル"]);

    // 著者には作業中の版も見える
    const forAuthor = await getArticleDetail(author, articleId);
    expect(forAuthor?.working?.title).toBe("さらに編集");
  });

  it("審査中の版は変更できない", async () => {
    const author = await createUser();
    const { articleId, versionId } = await createUnpublishedArticle(author.id, { status: "admin_review", title: "審査中" });
    loginAs(author);

    const result = await saveDraft({ ...newDraft, articleId, title: "審査中に変更" });
    expect(result).toMatchObject({ ok: false, code: "locked" });
    expect((await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId } })).title).toBe("審査中");
    expect(await prisma.articleVersion.count()).toBe(1);
  });

  it("タグの数・文字種、タイトルの長さを検証する", async () => {
    const user = await createUser();
    loginAs(user);
    expect(await saveDraft({ ...newDraft, tags: ["a b c d e f"] })).toMatchObject({ ok: false, code: "invalid" });
    expect(await saveDraft({ ...newDraft, tags: ["<script>"] })).toMatchObject({ ok: false, code: "invalid" });
    expect(await saveDraft({ ...newDraft, title: "あ".repeat(101) })).toMatchObject({ ok: false, code: "invalid" });
    expect(await prisma.article.count()).toBe(0);
  });
});

describe("記事の閲覧権限", () => {
  it("他人の下書き（未公開の記事）は見えない。admin でも見えない", async () => {
    const author = await createUser();
    const member = await createUser();
    const admin = await createUser({ role: "admin" });
    const { articleId } = await createUnpublishedArticle(author.id, { title: "秘密の下書き" });

    expect(await getArticleDetail(member, articleId)).toBeNull();
    expect(await getArticleDetail(admin, articleId)).toBeNull();
    expect(await getArticleForEdit(admin, articleId)).toBeNull();
    expect((await listPublishedArticles()).items).toHaveLength(0);

    const own = await getArticleDetail(author, articleId);
    expect(own?.working?.title).toBe("秘密の下書き");
    expect(own?.published).toBeNull();
  });

  it("他人の公開記事は見られるが、編集画面は開けない", async () => {
    const author = await createUser();
    const other = await createUser({ role: "admin" });
    const { articleId } = await createPublishedArticle(author.id);
    expect(await getArticleDetail(other, articleId)).toMatchObject({ isAuthor: false });
    expect(await getArticleForEdit(other, articleId)).toBeNull();
  });

  it("緊急非公開の記事は一覧・詳細・タグに出ない（著者には見える）", async () => {
    const author = await createUser();
    const other = await createUser();
    const { articleId } = await createPublishedArticle(author.id, { tags: ["Hidden"] });
    await prisma.article.update({ where: { id: articleId }, data: { hiddenAt: new Date() } });

    expect(await getArticleDetail(other, articleId)).toBeNull();
    expect((await listPublishedArticles()).items).toHaveLength(0);
    expect(await listTags()).toHaveLength(0);
    expect(await getArticleDetail(author, articleId)).toMatchObject({ hidden: true });
  });

  it("不正な ID ではエラーにせず null を返す", async () => {
    const user = await createUser();
    expect(await getArticleDetail(user, "not-a-uuid")).toBeNull();
    expect(await getArticleDetail(user, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("記事一覧", () => {
  it("新着順に並び、部署とタグで絞り込める", async () => {
    const dev = await createUser({ department: "dev" });
    const infra = await createUser({ department: "infra" });
    await createPublishedArticle(dev.id, { title: "古い", tags: ["TypeScript"], publishedAt: new Date("2026-09-01T00:00:00Z") });
    await createPublishedArticle(infra.id, { title: "新しい", tags: ["Linux"], publishedAt: new Date("2026-09-10T00:00:00Z") });

    expect((await listPublishedArticles()).items.map((a) => a.title)).toEqual(["新しい", "古い"]);
    expect((await listPublishedArticles({ department: "dev" })).items.map((a) => a.title)).toEqual(["古い"]);
    expect((await listPublishedArticles({ tagName: "ＬＩＮＵＸ" })).items.map((a) => a.title)).toEqual(["新しい"]);
  });

  it("タグ一覧は公開記事の数で数える（下書きのタグは数えない）", async () => {
    const user = await createUser();
    await createPublishedArticle(user.id, { tags: ["AWS"] });
    await createPublishedArticle(user.id, { tags: ["AWS", "Go"] });
    await createUnpublishedArticle(user.id, { tags: ["Go", "Draftonly"] });

    expect(await listTags()).toEqual([
      { name: "aws", displayName: "AWS", articleCount: 2 },
      { name: "go", displayName: "Go", articleCount: 1 },
    ]);
  });

  it("自分の記事を状態のタブごとに返す", async () => {
    const me = await createUser();
    const other = await createUser();
    await createUnpublishedArticle(me.id, { title: "下書き" });
    await createUnpublishedArticle(me.id, { title: "審査中", status: "ai_review" });
    await createPublishedArticle(me.id, { title: "公開" });
    await createUnpublishedArticle(other.id, { title: "他人の下書き" });

    const drafts = await listMyArticles(me, "draft");
    expect(drafts.items.map((a) => a.title)).toEqual(["下書き"]);
    expect(drafts.countByTab).toEqual({ draft: 1, review: 1, rejected: 0, published: 1 });
    expect((await listMyArticles(me, "review")).items.map((a) => a.title)).toEqual(["審査中"]);
  });
});
