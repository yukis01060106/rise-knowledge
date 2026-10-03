import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveVersion, rejectVersion } from "@/server/workflow";
import { submitReviewAction } from "@/server/workflow/actions";
import { giveAward, markAllNotificationsRead } from "@/server/insights/actions";
import { dashboardStats, monthlyRanking, unreadNotificationCount } from "@/server/insights/queries";
import { sendSlackJob, slackPayload } from "@/server/notifications/slack";
import { prisma } from "@/server/db";
import { monthOf } from "@/lib/month";
import { createUser, resetDb } from "../helpers/db";
import { expectForbidden, loginAs } from "../helpers/auth";
import { createPublishedArticle, createUnpublishedArticle } from "../helpers/articles";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SLACK_WEBHOOK_URL;
});

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

const BODY = "本文に客先名ACMEが含まれる秘密の内容";

describe("サイト内通知", () => {
  it("申請 → 著者以外の admin にレビュー待ち、承認 → 著者に通知。通知に本文は入れない", async () => {
    const author = await createUser({ role: "admin" });
    const admin = await createUser({ role: "admin" });
    const { articleId, versionId } = await createUnpublishedArticle(author.id, { title: "通知テスト", body: BODY });
    loginAs(author);
    await submitReviewAction(articleId);

    expect(await prisma.notification.count({ where: { userId: admin.id, type: "review_requested" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: author.id, type: "review_requested" } })).toBe(0);

    await approveVersion(admin, versionId);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: author.id, type: "approved" } });
    expect(n.payload).toEqual({ title: "通知テスト" });
    const all = await prisma.notification.findMany();
    expect(JSON.stringify(all.map((x) => x.payload))).not.toContain("ACME");
  });

  it("差し戻し → 著者に理由付きで通知", async () => {
    const author = await createUser();
    const admin = await createUser({ role: "admin" });
    const { versionId } = await createUnpublishedArticle(author.id, { status: "admin_review" });
    await rejectVersion(admin, versionId, "客先名を伏せてください");
    expect((await prisma.notification.findFirstOrThrow({ where: { userId: author.id } })).payload).toMatchObject({ reason: "客先名を伏せてください" });
  });

  it("既読にできるのは自分の通知だけ", async () => {
    const a = await createUser();
    const b = await createUser();
    await prisma.notification.createMany({
      data: [
        { userId: a.id, type: "liked", payload: { title: "x" } },
        { userId: b.id, type: "liked", payload: { title: "y" } },
      ],
    });
    loginAs(a);
    await markAllNotificationsRead();
    expect(await unreadNotificationCount({ id: a.id, role: "member" })).toBe(0);
    expect(await unreadNotificationCount({ id: b.id, role: "member" })).toBe(1);
  });
});

describe("Slack 通知", () => {
  it("Webhook が未設定なら送らず、エラーにもならない", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendSlackJob({ kind: "published", title: "t", url: "https://k.example/articles/1" })).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Slack 以外の URL は送り先にしない", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://evil.example/hook";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendSlackJob({ kind: "published", title: "t", url: "u" })).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("送る内容はタイトルと URL だけ（本文は入れない）。リンク記法の記号はエスケープする", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/XXXX";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await sendSlackJob({ kind: "published", title: "<b>記事</b> & テスト", url: "https://k.example/articles/1" });
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body).toEqual({ text: "新しい記事が公開されました：<https://k.example/articles/1|&lt;b&gt;記事&lt;/b&gt; &amp; テスト>" });
    expect(Object.keys(slackPayload({ kind: "x", title: "t", url: "u" }))).toEqual(["text"]);
  });

  it("承認時に Webhook があれば Slack に送る（失敗しても承認は成功する）", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T000/B000/XXXX";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const author = await createUser();
    const admin = await createUser({ role: "admin" });
    const { versionId } = await createUnpublishedArticle(author.id, { status: "admin_review", body: BODY });
    expect(await approveVersion(admin, versionId)).toMatchObject({ ok: true });
    expect(fetchSpy).toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0][1]?.body)).not.toContain("ACME");
  });
});

describe("月間ランキング・表彰", () => {
  it("その月のいいねで並べる。投稿者ランキングにイニシャル表示の記事は数えない", async () => {
    const author = await createUser({ name: "著者" });
    const [u1, u2] = [await createUser(), await createUser()];
    const a = await createPublishedArticle(author.id, { title: "A" });
    const b = await createPublishedArticle(author.id, { title: "B" });
    await prisma.$executeRaw`ALTER TABLE article_versions DISABLE TRIGGER article_versions_guard`;
    await prisma.articleVersion.update({ where: { id: b.versionId }, data: { showInitials: true } });
    await prisma.$executeRaw`ALTER TABLE article_versions ENABLE TRIGGER article_versions_guard`;
    await prisma.like.createMany({
      data: [
        { userId: u1.id, articleId: b.articleId },
        { userId: u2.id, articleId: b.articleId },
        { userId: u1.id, articleId: a.articleId },
      ],
    });
    // 先月のいいね（今月には数えない）
    const u3 = await createUser();
    await prisma.like.create({ data: { userId: u3.id, articleId: a.articleId, createdAt: new Date(Date.now() - 40 * 86400_000) } });

    const r = await monthlyRanking(monthOf(new Date()));
    expect(r.articles.map((x) => [x.title, x.monthLikes])).toEqual([["B", 2], ["A", 1]]);
    expect(r.articles[0].author.isInitials).toBe(true);
    expect(r.authors).toEqual([expect.objectContaining({ id: author.id, monthLikes: 1 })]);
  });

  it("表彰は admin だけ・1 か月に 1 本。監査ログと著者への通知が残る", async () => {
    const author = await createUser();
    const admin = await createUser({ role: "admin" });
    const a = await createPublishedArticle(author.id);
    const b = await createPublishedArticle(author.id);
    const month = monthOf(new Date());

    loginAs(author);
    await expectForbidden(giveAward(null, form({ month, articleId: a.articleId })));

    loginAs(admin);
    expect(await giveAward(null, form({ month, articleId: a.articleId, comment: "わかりやすい！" }))).toMatchObject({ ok: true });
    expect(await giveAward(null, form({ month, articleId: b.articleId }))).toMatchObject({ ok: false, message: "この月はすでに表彰済みです" });
    expect(await prisma.auditLog.count({ where: { action: "award_given" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: author.id, type: "award" } })).toBe(1);
    expect((await monthlyRanking(month)).award).toMatchObject({ articleId: a.articleId });
  });
});

describe("管理者ダッシュボード", () => {
  it("member は見られない", async () => {
    const member = await createUser();
    await expectForbidden(dashboardStats(member));
  });

  it("部署別の公開数・レビュー平均時間・AI の割合を数える", async () => {
    const dev = await createUser({ department: "dev" });
    const infra = await createUser({ department: "infra" });
    const admin = await createUser({ role: "admin" });
    await createPublishedArticle(dev.id);
    await createPublishedArticle(dev.id);
    await createPublishedArticle(infra.id);
    // レビュー：申請から 2 時間で承認
    const { versionId } = await createUnpublishedArticle(dev.id, { status: "admin_review" });
    await prisma.articleVersion.update({ where: { id: versionId }, data: { submittedAt: new Date(Date.now() - 2 * 3600_000) } });
    await approveVersion(admin, versionId);
    await prisma.auditLog.createMany({
      data: [
        { actorType: "system", action: "ai_check_completed" },
        { actorType: "system", action: "ai_check_completed" },
        { actorType: "system", action: "auto_rejected" },
        { actorType: "system", action: "ai_check_failed" },
      ],
    });

    const s = await dashboardStats(admin);
    expect(s.months).toHaveLength(6);
    expect(s.months[5]).toMatchObject({ dev: 3, infra: 1 });
    expect(s.publishedThisMonth).toBe(4);
    expect(s.avgReviewHours).toBeCloseTo(2, 1);
    expect(s.autoRejectRate).toBe(0.5);
    expect(s.aiFailRate).toBeCloseTo(1 / 3);
  });
});
