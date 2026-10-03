import { beforeEach, describe, expect, it } from "vitest";
import { approveComment, deleteComment, postComment, toggleFollowTag, toggleLike, toggleStock } from "@/server/social/actions";
import { followedTagFeed, getEngagement, getUserProfile, listFlaggedComments, listStocks, weeklyTrending } from "@/server/social/queries";
import { setComplianceDepsForTests } from "@/server/compliance";
import { ReviewerError } from "@/server/compliance/reviewer";
import { prisma } from "@/server/db";
import { createUser, resetDb } from "../helpers/db";
import { expectForbidden, expectRedirect, loginAs } from "../helpers/auth";
import { createPublishedArticle, createUnpublishedArticle } from "../helpers/articles";

beforeEach(resetDb);

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

function aiReturns(riskLevel: "low" | "medium" | "high" | "error") {
  setComplianceDepsForTests({
    sleep: async () => {},
    reviewer: {
      async review() {
        if (riskLevel === "error") throw new ReviewerError("api_error", true);
        return {
          riskLevel,
          summary: riskLevel === "low" ? "問題は見当たりません" : "客先名が含まれています",
          findings: riskLevel === "low" ? [] : [{ line: 1, type: "customer_info", excerpt: "ACME", suggestion: "客先名を伏せてください" }],
          model: "fake",
        };
      },
    },
  });
}

describe("いいね", () => {
  it("未ログインではできない", async () => {
    const author = await createUser();
    const { articleId } = await createPublishedArticle(author.id);
    loginAs(null);
    await expectRedirect(toggleLike(articleId), "/login");
  });

  it("押すといいね、もう一度押すと取り消し。著者に通知（未読のうちは 1 件にまとめる）", async () => {
    const author = await createUser();
    const reader = await createUser();
    const { articleId } = await createPublishedArticle(author.id);
    loginAs(reader);
    expect(await toggleLike(articleId)).toMatchObject({ ok: true, liked: true, count: 1 });
    expect(await toggleLike(articleId)).toMatchObject({ ok: true, liked: false, count: 0 });
    expect(await toggleLike(articleId)).toMatchObject({ ok: true, liked: true, count: 1 });
    expect(await prisma.notification.count({ where: { userId: author.id, type: "liked" } })).toBe(1);
  });

  it("同時に押しても重複しない", async () => {
    const author = await createUser();
    const reader = await createUser();
    const { articleId } = await createPublishedArticle(author.id);
    loginAs(reader);
    await Promise.all([toggleLike(articleId), toggleLike(articleId)]);
    expect(await prisma.like.count({ where: { articleId } })).toBeLessThanOrEqual(1);
  });

  it("自分の記事・下書き・緊急非公開の記事にはできない", async () => {
    const author = await createUser();
    const reader = await createUser();
    const own = await createPublishedArticle(reader.id);
    const draft = await createUnpublishedArticle(author.id);
    const hidden = await createPublishedArticle(author.id);
    await prisma.article.update({ where: { id: hidden.articleId }, data: { hiddenAt: new Date() } });
    loginAs(reader);
    expect(await toggleLike(own.articleId)).toMatchObject({ ok: false });
    expect(await toggleLike(draft.articleId)).toMatchObject({ ok: false, message: "記事が見つかりません" });
    expect(await toggleLike(hidden.articleId)).toMatchObject({ ok: false });
    expect(await prisma.like.count()).toBe(0);
  });
});

describe("ストック", () => {
  it("ストックした記事を新しい順に一覧できる。非公開になった記事は出さない", async () => {
    const author = await createUser();
    const reader = await createUser();
    const a = await createPublishedArticle(author.id, { title: "A" });
    const b = await createPublishedArticle(author.id, { title: "B" });
    loginAs(reader);
    expect(await toggleStock(a.articleId)).toMatchObject({ ok: true, stocked: true });
    await toggleStock(b.articleId);
    expect((await listStocks(reader)).map((x) => x.title)).toEqual(["B", "A"]);
    await prisma.article.update({ where: { id: b.articleId }, data: { hiddenAt: new Date() } });
    expect((await listStocks(reader)).map((x) => x.title)).toEqual(["A"]);
    expect(await toggleStock(a.articleId)).toMatchObject({ ok: true, stocked: false });
  });
});

describe("コメント（事前スキャン＋AI チェック）", () => {
  it("low はそのまま表示し、著者に通知する", async () => {
    const author = await createUser();
    const reader = await createUser();
    const { articleId } = await createPublishedArticle(author.id);
    aiReturns("low");
    loginAs(reader);
    expect(await postComment(null, form({ articleId, body: "参考になりました！" }))).toMatchObject({ ok: true });
    const c = await prisma.comment.findFirstOrThrow();
    expect(c.status).toBe("visible");
    expect(await prisma.complianceCheck.findFirst({ where: { commentId: c.id } })).toMatchObject({ targetType: "comment", status: "succeeded" });
    expect(await prisma.notification.count({ where: { userId: author.id, type: "commented" } })).toBe(1);
  });

  it("medium は表示したまま要確認にし、admin に通知する", async () => {
    const author = await createUser();
    const admin = await createUser({ role: "admin" });
    const { articleId } = await createPublishedArticle(author.id);
    aiReturns("medium");
    loginAs(author);
    expect(await postComment(null, form({ articleId, body: "ACME 社でもこうでした" }))).toMatchObject({ ok: true });
    expect((await prisma.comment.findFirstOrThrow()).status).toBe("flagged");
    expect(await prisma.notification.count({ where: { userId: admin.id, type: "comment_flagged" } })).toBe(1);
    expect(await listFlaggedComments(admin)).toHaveLength(1);
    expect(await prisma.auditLog.findFirst({ where: { action: "comment_flagged" } })).not.toBeNull();
  });

  it("AI チェックに失敗したら、安全のため要確認にする", async () => {
    const author = await createUser();
    const { articleId } = await createPublishedArticle(author.id);
    aiReturns("error");
    loginAs(author);
    await postComment(null, form({ articleId, body: "コメント" }));
    expect((await prisma.comment.findFirstOrThrow()).status).toBe("flagged");
  });

  it("high は投稿させない（監査のため blocked で残し、画面には出さない）", async () => {
    const author = await createUser();
    const reader = await createUser();
    const { articleId } = await createPublishedArticle(author.id);
    aiReturns("high");
    loginAs(reader);
    const r = await postComment(null, form({ articleId, body: "ACME 社の本番 DB は…" }));
    expect(r).toMatchObject({ ok: false, details: ["客先名を伏せてください"] });
    expect((await prisma.comment.findFirstOrThrow()).status).toBe("blocked");
    expect((await getEngagement(reader, articleId))?.comments).toHaveLength(0);
    expect(await prisma.auditLog.findFirst({ where: { action: "comment_blocked" } })).not.toBeNull();
  });

  it("秘密鍵などは事前スキャンで止め、コメントを保存しない（値も残さない）", async () => {
    const author = await createUser();
    const { articleId } = await createPublishedArticle(author.id);
    loginAs(author);
    const r = await postComment(null, form({ articleId, body: "鍵です -----BEGIN " + "RSA PRIVATE KEY-----" }));
    expect(r).toMatchObject({ ok: false, details: ["1 行目：秘密鍵"] });
    expect(await prisma.comment.count()).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "comment_blocked" } });
    expect(JSON.stringify(log.metadata)).not.toContain("PRIVATE KEY");
  });

  it("下書き・緊急非公開の記事にはコメントできない", async () => {
    const author = await createUser();
    const draft = await createUnpublishedArticle(author.id);
    loginAs(author);
    expect(await postComment(null, form({ articleId: draft.articleId, body: "x" }))).toMatchObject({ ok: false, message: "記事が見つかりません" });
  });

  it("イニシャル表示の記事では、著者本人のコメントもイニシャルで表示する（実名を出さない）", async () => {
    const author = await createUser({ name: "実名 太郎" });
    await prisma.user.update({ where: { id: author.id }, data: { initials: "J.T." } });
    const reader = await createUser({ name: "読者 花子" });
    const { articleId, versionId } = await createPublishedArticle(author.id);
    // 公開済みの版にイニシャル表示を付けるため、トリガーを通る形（新しい記事）で作り直す
    await prisma.$executeRaw`ALTER TABLE article_versions DISABLE TRIGGER article_versions_guard`;
    await prisma.articleVersion.update({ where: { id: versionId }, data: { showInitials: true } });
    await prisma.$executeRaw`ALTER TABLE article_versions ENABLE TRIGGER article_versions_guard`;
    loginAs(author);
    await postComment(null, form({ articleId, body: "著者です" }));
    loginAs(reader);
    await postComment(null, form({ articleId, body: "読者です" }));

    const view = await getEngagement(reader, articleId);
    expect(view?.comments.map((c) => c.author.name)).toEqual(["J.T.", "読者 花子"]);
    expect(view?.comments[0].author.profileId).toBeNull();
    expect(JSON.stringify(view)).not.toContain("実名 太郎");
  });

  it("削除は本人か admin。admin が消したら監査ログに残す。member は他人のコメントを消せない", async () => {
    const author = await createUser();
    const other = await createUser();
    const admin = await createUser({ role: "admin" });
    const { articleId } = await createPublishedArticle(author.id);
    loginAs(author);
    await postComment(null, form({ articleId, body: "1" }));
    await postComment(null, form({ articleId, body: "2" }));
    const [c1, c2] = await prisma.comment.findMany({ orderBy: { createdAt: "asc" } });

    loginAs(other);
    expect(await deleteComment(c1.id)).toMatchObject({ ok: false });
    loginAs(author);
    expect(await deleteComment(c1.id)).toMatchObject({ ok: true });
    loginAs(admin);
    expect(await deleteComment(c2.id)).toMatchObject({ ok: true });
    expect(await prisma.auditLog.findMany({ where: { action: "comment_deleted" } })).toHaveLength(1);
    expect((await getEngagement(admin, articleId))?.comments.every((c) => c.deleted && c.html === "")).toBe(true);
  });

  it("要確認コメントの承認は admin だけ", async () => {
    const author = await createUser();
    const admin = await createUser({ role: "admin" });
    const { articleId } = await createPublishedArticle(author.id);
    aiReturns("medium");
    loginAs(author);
    await postComment(null, form({ articleId, body: "x" }));
    const c = await prisma.comment.findFirstOrThrow();
    await expectForbidden(approveComment(c.id));
    loginAs(admin);
    expect(await approveComment(c.id)).toMatchObject({ ok: true });
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("visible");
  });
});

describe("タグのフォローとフィード", () => {
  it("フォローしたタグの新着がフィードに出る", async () => {
    const author = await createUser();
    const reader = await createUser();
    await createPublishedArticle(author.id, { title: "AWS の記事", tags: ["AWS"] });
    await createPublishedArticle(author.id, { title: "Go の記事", tags: ["Go"] });
    loginAs(reader);
    expect(await toggleFollowTag("aws")).toMatchObject({ ok: true, following: true });
    expect((await followedTagFeed(reader)).items.map((a) => a.title)).toEqual(["AWS の記事"]);
    expect(await toggleFollowTag("aws")).toMatchObject({ ok: true, following: false });
    expect((await followedTagFeed(reader)).items).toHaveLength(0);
  });
});

describe("今週のトレンド・ユーザーページ", () => {
  it("直近 7 日のいいねが多い順。古いいいねは数えない", async () => {
    const author = await createUser();
    const [u1, u2] = [await createUser(), await createUser()];
    const a = await createPublishedArticle(author.id, { title: "A" });
    const b = await createPublishedArticle(author.id, { title: "B" });
    await prisma.like.createMany({
      data: [
        { userId: u1.id, articleId: a.articleId },
        { userId: u1.id, articleId: b.articleId },
        { userId: u2.id, articleId: b.articleId },
      ],
    });
    // A に 10 日前のいいね（数えない）
    const u3 = await createUser();
    await prisma.like.create({ data: { userId: u3.id, articleId: a.articleId, createdAt: new Date(Date.now() - 10 * 86400_000) } });
    expect((await weeklyTrending()).map((x) => x.title)).toEqual(["B", "A"]);
  });

  it("ユーザーページにはイニシャル表示の記事を出さず、いいねの合計にも含めない", async () => {
    const author = await createUser();
    const reader = await createUser();
    const named = await createPublishedArticle(author.id, { title: "実名の記事" });
    const initials = await createPublishedArticle(author.id, { title: "イニシャルの記事" });
    await prisma.$executeRaw`ALTER TABLE article_versions DISABLE TRIGGER article_versions_guard`;
    await prisma.articleVersion.update({ where: { id: initials.versionId }, data: { showInitials: true } });
    await prisma.$executeRaw`ALTER TABLE article_versions ENABLE TRIGGER article_versions_guard`;
    await prisma.like.createMany({ data: [{ userId: reader.id, articleId: named.articleId }, { userId: reader.id, articleId: initials.articleId }] });

    const profile = await getUserProfile(author.id);
    expect(profile?.articles.map((a) => a.title)).toEqual(["実名の記事"]);
    expect(profile?.likeTotal).toBe(1);
  });
});
