import { beforeEach, describe, expect, it } from "vitest";
import { saveDraft } from "@/server/articles/actions";
import { getArticleDetail, listPublishedArticles } from "@/server/articles/queries";
import { getVersionForReview, listPendingReviews } from "@/server/articles/admin-queries";
import {
  applyAiCheckResult,
  approveVersion,
  discardDraft,
  hideArticle,
  rejectVersion,
  submitForReview,
  unhideArticle,
} from "@/server/workflow";
import { approveAction, rejectAction, setArticleHiddenAction, submitReviewAction } from "@/server/workflow/actions";
import { prisma } from "@/server/db";
import { createUser, resetDb } from "../helpers/db";
import { expectForbidden, expectRedirect, loginAs } from "../helpers/auth";
import { addVersion, createPublishedArticle, createUnpublishedArticle } from "../helpers/articles";

beforeEach(resetDb);

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

const statusOf = async (versionId: string) =>
  (await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } })).status;

const actions = async () => (await prisma.auditLog.findMany({ orderBy: { id: "asc" } })).map((l) => l.action);

/** 著者・別の admin 2 人・member を用意する */
async function setup() {
  const author = await createUser();
  const admin = await createUser({ role: "admin" });
  const admin2 = await createUser({ role: "admin" });
  const member = await createUser();
  return { author, admin, admin2, member };
}

/** 下書きを作ってレビュー申請し、admin_review まで進める（AI チェックは仮実装で通過する） */
async function submitted(authorId: string, title = "審査される記事") {
  const { articleId, versionId } = await createUnpublishedArticle(authorId, { title });
  loginAs({ id: authorId });
  const result = await submitReviewAction(articleId);
  expect(result).toMatchObject({ ok: true });
  return { articleId, versionId };
}

describe("レビュー申請（draft → ai_review → admin_review）", () => {
  it("未ログインでは申請できない", async () => {
    const { author } = await setup();
    const { articleId, versionId } = await createUnpublishedArticle(author.id);
    loginAs(null);
    await expectRedirect(submitReviewAction(articleId), "/login");
    expect(await statusOf(versionId)).toBe("draft");
  });

  it("申請すると AI チェック（仮実装）を経て管理者の確認待ちになり、監査ログが残る", async () => {
    const { author } = await setup();
    const { articleId, versionId } = await submitted(author.id);

    const v = await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(v.status).toBe("admin_review");
    expect(v.submittedAt).not.toBeNull();
    expect(await actions()).toEqual(["submitted", "ai_check_completed"]);
    // AI は公開しない
    expect((await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).publishedVersionId).toBeNull();
  });

  it("他人の記事は申請できない（admin でも）", async () => {
    const { author, admin } = await setup();
    const { articleId, versionId } = await createUnpublishedArticle(author.id);
    const result = await submitForReview(admin, articleId);
    expect(result).toMatchObject({ ok: false, code: "not_found" });
    expect(await statusOf(versionId)).toBe("draft");
  });

  it("タイトルか本文が空なら申請できない", async () => {
    const { author } = await setup();
    const a = await createUnpublishedArticle(author.id, { title: "  " });
    const b = await createUnpublishedArticle(author.id, { body: "\n" });
    expect(await submitForReview(author, a.articleId)).toMatchObject({ ok: false, code: "invalid" });
    expect(await submitForReview(author, b.articleId)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("審査中の版は再申請・編集できない", async () => {
    const { author } = await setup();
    const { articleId, versionId } = await submitted(author.id);
    expect(await submitForReview(author, articleId)).toMatchObject({ ok: false, code: "invalid_state" });
    expect(await saveDraft({ articleId, title: "審査中に変更", bodyMd: "x", tags: [], category: "dev", expectedUpdatedAt: null })).toMatchObject({
      ok: false,
      code: "locked",
    });
    expect((await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId } })).title).toBe("審査される記事");
  });
});

describe("承認（admin_review → published）", () => {
  it("別の admin が承認すると公開され、監査ログが残る", async () => {
    const { author, admin } = await setup();
    const { articleId, versionId } = await submitted(author.id);

    loginAs(admin);
    await expectRedirect(approveAction(null, form({ versionId })), "/admin/reviews?done=approved");

    const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(article.publishedVersionId).toBe(versionId);
    expect(article.firstPublishedAt).not.toBeNull();
    const v = await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(v).toMatchObject({ status: "published", decidedBy: admin.id });
    expect((await listPublishedArticles()).items.map((a) => a.id)).toEqual([articleId]);
    expect(await prisma.auditLog.findFirst({ where: { action: "approved" } })).toMatchObject({ actorId: admin.id, versionId });
  });

  it("member は承認できない（Server Action が 403）", async () => {
    const { author, member } = await setup();
    const { versionId } = await submitted(author.id);
    loginAs(member);
    await expectForbidden(approveAction(null, form({ versionId })));
    expect(await statusOf(versionId)).toBe("admin_review");
    // 関数を直接呼んでも拒否する
    expect(await approveVersion(member, versionId)).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("admin でも自分の記事は承認・差し戻しできない", async () => {
    const { admin } = await setup();
    const { versionId } = await submitted(admin.id);
    expect(await approveVersion(admin, versionId)).toMatchObject({ ok: false, code: "self_approval" });
    expect(await rejectVersion(admin, versionId, "理由")).toMatchObject({ ok: false, code: "self_approval" });
    expect(await statusOf(versionId)).toBe("admin_review");
  });

  it("審査待ちでない版（下書き・AI チェック中・公開済み）は承認できない", async () => {
    const { author, admin } = await setup();
    const draft = await createUnpublishedArticle(author.id);
    const aiReview = await createUnpublishedArticle(author.id, { status: "ai_review" });
    const published = await createPublishedArticle(author.id);
    for (const { versionId } of [draft, aiReview, published]) {
      expect(await approveVersion(admin, versionId)).toMatchObject({ ok: false, code: "invalid_state" });
    }
    expect(await statusOf(draft.versionId)).toBe("draft");
    expect(await statusOf(aiReview.versionId)).toBe("ai_review");
  });

  it("2 人の admin が同時に承認しても、公開は 1 回だけ", async () => {
    const { author, admin, admin2 } = await setup();
    const { versionId } = await submitted(author.id);

    const results = await Promise.all([approveVersion(admin, versionId), approveVersion(admin2, versionId)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)[0]).toMatchObject({ code: "invalid_state" });
    expect(await prisma.auditLog.count({ where: { action: "approved" } })).toBe(1);
  });

  it("承認と差し戻しが同時でも、どちらか一方だけが反映される", async () => {
    const { author, admin, admin2 } = await setup();
    const { versionId } = await submitted(author.id);
    const results = await Promise.all([approveVersion(admin, versionId), rejectVersion(admin2, versionId, "理由")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: { in: ["approved", "rejected"] } } })).toBe(1);
  });
});

describe("差し戻し（admin_review → rejected）と再申請", () => {
  it("理由がないと差し戻せない", async () => {
    const { author, admin } = await setup();
    const { versionId } = await submitted(author.id);
    loginAs(admin);
    expect(await rejectAction(null, form({ versionId, reason: "   " }))).toMatchObject({ ok: false });
    expect(await rejectVersion(admin, versionId, "あ".repeat(1001))).toMatchObject({ ok: false, code: "invalid" });
    expect(await statusOf(versionId)).toBe("admin_review");
  });

  it("差し戻すと理由が残り、著者が修正すると新しい版を作って再申請できる", async () => {
    const { author, admin } = await setup();
    const { articleId, versionId } = await submitted(author.id);
    loginAs(admin);
    await expectRedirect(rejectAction(null, form({ versionId, reason: "客先名が書かれています" })), "/admin/reviews?done=rejected");

    expect(await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId } })).toMatchObject({
      status: "rejected",
      rejectReason: "客先名が書かれています",
      decidedBy: admin.id,
    });
    expect(await prisma.auditLog.findFirst({ where: { action: "rejected" } })).toMatchObject({ reason: "客先名が書かれています" });

    // 著者には差し戻された版が作業中として見える
    const detail = await getArticleDetail(author, articleId);
    expect(detail?.working).toMatchObject({ status: "rejected", rejectReason: "客先名が書かれています" });

    // 修正すると v2 の下書きができ、差し戻された v1 はそのまま残る
    loginAs(author);
    const saved = await saveDraft({ articleId, title: "直した記事", bodyMd: "伏せました", tags: [], category: "dev", expectedUpdatedAt: null });
    expect(saved).toMatchObject({ ok: true, versionNo: 2 });
    if (!saved.ok) return;
    expect(await prisma.articleVersion.findUniqueOrThrow({ where: { id: saved.versionId } })).toMatchObject({
      status: "draft",
      basedOnVersionId: versionId,
    });
    expect(await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId } })).toMatchObject({
      status: "rejected",
      title: "審査される記事",
    });

    expect(await submitReviewAction(articleId)).toMatchObject({ ok: true });
    expect(await statusOf(saved.versionId)).toBe("admin_review");
  });
});

describe("公開後の編集", () => {
  it("新しい版の審査中も旧版を表示し、承認されたら差し替えて旧版を superseded にする", async () => {
    const { author, admin, member } = await setup();
    const { articleId, versionId: v1 } = await createPublishedArticle(author.id, { title: "v1 のタイトル" });
    const firstPublishedAt = (await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).firstPublishedAt;

    loginAs(author);
    const saved = await saveDraft({ articleId, title: "v2 のタイトル", bodyMd: "更新", tags: [], category: "dev", expectedUpdatedAt: null });
    if (!saved.ok) throw new Error(saved.message);
    expect(await submitReviewAction(articleId)).toMatchObject({ ok: true });

    // 審査中も、ほかの人には v1 が見える
    expect((await getArticleDetail(member, articleId))?.published?.title).toBe("v1 のタイトル");
    expect((await listPublishedArticles()).items[0].title).toBe("v1 のタイトル");

    // レビュー画面では公開中の v1 と比べられる
    const review = await getVersionForReview(admin, saved.versionId);
    expect(review?.compareTo?.id).toBe(v1);

    expect(await approveVersion(admin, saved.versionId)).toMatchObject({ ok: true });
    expect(await statusOf(v1)).toBe("superseded");
    const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
    expect(article.publishedVersionId).toBe(saved.versionId);
    // 初回公開日時は変えない
    expect(article.firstPublishedAt).toEqual(firstPublishedAt);
    expect((await getArticleDetail(member, articleId))?.published?.title).toBe("v2 のタイトル");
  });
});

describe("AI チェックの結果の反映", () => {
  it("AI 判定 high は自動で差し戻し、公開はしない", async () => {
    const { author } = await setup();
    const { articleId, versionId } = await createUnpublishedArticle(author.id, { status: "ai_review" });
    expect(await applyAiCheckResult(versionId, { kind: "high", reason: "IP アドレスが含まれています", metadata: { risk: "high" } })).toEqual({
      applied: true,
    });
    expect(await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId } })).toMatchObject({
      status: "rejected",
      rejectReason: "IP アドレスが含まれています",
    });
    expect(await actions()).toEqual(["ai_check_completed", "auto_rejected"]);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).publishedVersionId).toBeNull();
  });

  it("AI チェックが失敗したら「未実施」として管理者の確認へ", async () => {
    const { author, admin } = await setup();
    const { versionId } = await createUnpublishedArticle(author.id, { status: "ai_review" });
    await applyAiCheckResult(versionId, { kind: "failed", metadata: { attempts: 3 } });
    expect(await prisma.articleVersion.findUniqueOrThrow({ where: { id: versionId } })).toMatchObject({
      status: "admin_review",
      aiCheckFailed: true,
    });
    expect((await listPendingReviews(admin))[0]).toMatchObject({ versionId, aiCheckFailed: true });
  });

  it("すでに ai_review でない版には反映しない（二重実行・取り下げ）", async () => {
    const { author } = await setup();
    const { versionId } = await createUnpublishedArticle(author.id, { status: "admin_review" });
    expect(await applyAiCheckResult(versionId, { kind: "high", reason: "x", metadata: {} })).toEqual({ applied: false });
    expect(await statusOf(versionId)).toBe("admin_review");
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

describe("緊急非公開・再公開", () => {
  it("理由が必要。非公開の記事は一覧・詳細から消え、著者には理由が見える", async () => {
    const { author, admin, member } = await setup();
    const { articleId } = await createPublishedArticle(author.id);
    expect(await hideArticle(admin, articleId, "")).toMatchObject({ ok: false, code: "invalid" });

    loginAs(admin);
    expect(await setArticleHiddenAction(null, form({ articleId, hidden: "true", reason: "社外秘の画像" }))).toMatchObject({ ok: true });
    expect((await listPublishedArticles()).items).toHaveLength(0);
    expect(await getArticleDetail(member, articleId)).toBeNull();
    expect(await getArticleDetail(author, articleId)).toMatchObject({ hidden: true, hiddenReason: "社外秘の画像" });
    // admin には見える
    expect(await getArticleDetail(admin, articleId)).toMatchObject({ hidden: true });
    expect(await hideArticle(admin, articleId, "二重")).toMatchObject({ ok: false, code: "invalid_state" });
  });

  it("member は非公開にできない", async () => {
    const { author, member } = await setup();
    const { articleId } = await createPublishedArticle(author.id);
    loginAs(member);
    await expectForbidden(setArticleHiddenAction(null, form({ articleId, hidden: "true", reason: "x" })));
    expect((await prisma.article.findUniqueOrThrow({ where: { id: articleId } })).hiddenAt).toBeNull();
  });

  it("著者本人の admin は非公開にはできるが、再公開はできない（別の admin が行う）", async () => {
    const { admin, admin2 } = await setup();
    const { articleId } = await createPublishedArticle(admin.id);
    expect(await hideArticle(admin, articleId, "念のため")).toMatchObject({ ok: true });
    expect(await unhideArticle(admin, articleId, "戻す")).toMatchObject({ ok: false, code: "self_approval" });
    expect(await unhideArticle(admin2, articleId, "確認済み")).toMatchObject({ ok: true });
    expect(await actions()).toEqual(["article_hidden", "article_unhidden"]);
  });

  it("非公開中に新しい版が承認されても、再公開まで表示しない", async () => {
    const { author, admin, member } = await setup();
    const { articleId } = await createPublishedArticle(author.id);
    await hideArticle(admin, articleId, "確認中");
    const { versionId } = await addVersion(articleId, { title: "直した版", status: "admin_review" });
    expect(await approveVersion(admin, versionId)).toMatchObject({ ok: true });
    expect(await getArticleDetail(member, articleId)).toBeNull();
  });
});

describe("下書きの破棄", () => {
  it("一度も審査に出していない記事は記事ごと削除し、監査ログを残す", async () => {
    const { author } = await setup();
    const { articleId } = await createUnpublishedArticle(author.id, { tags: ["Go"] });
    expect(await discardDraft(author, articleId)).toMatchObject({ ok: true, articleDeleted: true });
    expect(await prisma.article.count()).toBe(0);
    expect(await prisma.auditLog.findFirst()).toMatchObject({ action: "draft_discarded", articleId });
  });

  it("公開済みの記事の下書きは、その版だけ削除する", async () => {
    const { author } = await setup();
    const { articleId, versionId } = await createPublishedArticle(author.id);
    await addVersion(articleId, { title: "編集中" });
    expect(await discardDraft(author, articleId)).toMatchObject({ ok: true, articleDeleted: false });
    expect(await prisma.articleVersion.findMany({ select: { id: true } })).toEqual([{ id: versionId }]);
  });

  it("他人の下書き・審査中の版は破棄できない", async () => {
    const { author, admin } = await setup();
    const draft = await createUnpublishedArticle(author.id);
    const reviewing = await createUnpublishedArticle(author.id, { status: "admin_review" });
    expect(await discardDraft(admin, draft.articleId)).toMatchObject({ ok: false, code: "not_found" });
    expect(await discardDraft(author, reviewing.articleId)).toMatchObject({ ok: false, code: "invalid_state" });
    expect(await prisma.articleVersion.count()).toBe(2);
  });
});

describe("DB による保護（アプリを迂回した変更も拒否する）", () => {
  it("決められた遷移以外の状態変更は失敗する", async () => {
    const { author } = await setup();
    const { versionId } = await createUnpublishedArticle(author.id);
    await expect(prisma.articleVersion.update({ where: { id: versionId }, data: { status: "published" } })).rejects.toThrow(
      /invalid status transition/,
    );
    const { versionId: rejected } = await createUnpublishedArticle(author.id, { status: "rejected" });
    await expect(prisma.articleVersion.update({ where: { id: rejected }, data: { status: "admin_review" } })).rejects.toThrow(
      /invalid status transition/,
    );
  });

  it("新しい版をいきなり published で作れない", async () => {
    const { author } = await setup();
    const article = await prisma.article.create({ data: { authorId: author.id } });
    await expect(
      prisma.articleVersion.create({
        data: { articleId: article.id, versionNo: 1, title: "t", bodyMd: "b", createdBy: author.id, status: "published" },
      }),
    ).rejects.toThrow(/must be a draft/);
  });

  it("審査に出した版の内容・タグは変更できず、削除もできない", async () => {
    const { author } = await setup();
    const { versionId } = await createUnpublishedArticle(author.id, { status: "admin_review", tags: ["Go"] });
    await expect(prisma.articleVersion.update({ where: { id: versionId }, data: { bodyMd: "改ざん" } })).rejects.toThrow(/immutable/);
    await expect(prisma.versionTag.deleteMany({ where: { versionId } })).rejects.toThrow(/immutable/);
    await expect(prisma.articleVersion.delete({ where: { id: versionId } })).rejects.toThrow(/cannot delete/);
  });

  it("進行中の版（draft / 審査中）は 1 記事に 1 つまで", async () => {
    const { author } = await setup();
    const { articleId } = await createUnpublishedArticle(author.id);
    await expect(addVersion(articleId)).rejects.toThrow();
  });
});

describe("管理者向けの取得", () => {
  it("member は管理者向けの一覧を取得できない", async () => {
    const { member } = await setup();
    await expectForbidden(listPendingReviews(member));
  });

  it("admin でも他人の下書きはレビュー画面で開けない", async () => {
    const { author, admin } = await setup();
    const { versionId } = await createUnpublishedArticle(author.id);
    expect(await getVersionForReview(admin, versionId)).toBeNull();
  });
});

describe("再申請のレビュー", () => {
  it("差し戻された版を修正した再申請では、差し戻された版との差分を見られる", async () => {
    const { author, admin } = await setup();
    const { articleId, versionId: v1 } = await submitted(author.id);
    await rejectVersion(admin, v1, "直してください");
    loginAs(author);
    const saved = await saveDraft({ articleId, title: "直した", bodyMd: "直した本文", tags: [], category: "dev", expectedUpdatedAt: null });
    if (!saved.ok) throw new Error(saved.message);
    await submitReviewAction(articleId);

    const review = await getVersionForReview(admin, saved.versionId);
    expect(review?.compareTo).toBeNull();
    expect(review?.previousRejected).toMatchObject({ id: v1, rejectReason: "直してください" });
  });
});
