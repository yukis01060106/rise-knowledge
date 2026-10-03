import "server-only";
import type { NotificationType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { sendSlackJob, slackWebhookUrl, type SlackJob } from "./slack";

/**
 * サイト内通知と Slack 通知。
 * - 通知は付随する処理なので、失敗しても元の操作（承認・いいね・コメント）は失敗させない
 * - payload・Slack にはタイトル・理由など表示に必要なものだけを入れ、記事本文・コメント本文は入れない
 */

type Payload = { title: string; actorId?: string; actorName?: string | null; reason?: string | null; commentId?: string; month?: string };

async function safely(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.warn(`[notify] ${label} failed: ${e instanceof Error ? e.name : "unknown"}`);
  }
}

async function create(userId: string, type: NotificationType, articleId: string | null, payload: Payload) {
  await prisma.notification.create({ data: { userId, type, articleId, payload: payload as Prisma.InputJsonValue } });
}

async function articleTitle(articleId: string) {
  const a = await prisma.article.findUnique({
    where: { id: articleId },
    select: { authorId: true, publishedVersion: { select: { title: true } }, versions: { orderBy: { versionNo: "desc" }, take: 1, select: { title: true } } },
  });
  return a ? { authorId: a.authorId, title: a.publishedVersion?.title ?? a.versions[0]?.title ?? "" } : null;
}

async function activeAdmins(exceptUserId?: string) {
  return prisma.user.findMany({
    where: { role: "admin", disabledAt: null, ...(exceptUserId && { id: { not: exceptUserId } }) },
    select: { id: true },
  });
}

function articleUrl(articleId: string, path = "") {
  const base = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/articles/${articleId}${path}`;
}

/** Slack に送る。Webhook 未設定なら何もしない。本番はジョブに積み、開発・テストはその場で送る */
async function slack(job: SlackJob) {
  if (!slackWebhookUrl()) return;
  const mode = process.env.COMPLIANCE_RUNNER ?? (process.env.NODE_ENV === "production" ? "queue" : "inline");
  if (mode === "queue") {
    const { getBoss, QUEUES } = await import("@/server/jobs/queue");
    await (await getBoss()).send(QUEUES.notifySlack, job);
  } else {
    await sendSlackJob(job);
  }
}

/** 承認されて公開された（著者へ。Slack にも） */
export function notifyApproved(articleId: string) {
  return safely("approved", async () => {
    const a = await articleTitle(articleId);
    if (!a) return;
    await create(a.authorId, "approved", articleId, { title: a.title });
    await slack({ kind: "published", title: a.title, url: articleUrl(articleId) });
  });
}

/** 差し戻された（著者へ。理由付き） */
export function notifyRejected(articleId: string, reason: string, auto: boolean) {
  return safely("rejected", async () => {
    const a = await articleTitle(articleId);
    if (!a) return;
    await create(a.authorId, auto ? "auto_rejected" : "rejected", articleId, { title: a.title, reason });
  });
}

/** 管理者の確認待ちになった（著者以外の admin へ。Slack にも） */
export function notifyReviewRequested(articleId: string, versionId: string) {
  return safely("review_requested", async () => {
    const a = await articleTitle(articleId);
    if (!a) return;
    for (const admin of await activeAdmins(a.authorId)) await create(admin.id, "review_requested", articleId, { title: a.title });
    await slack({ kind: "review_requested", title: a.title, url: `${(process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/admin/reviews/${versionId}` });
  });
}

/** いいねされた（著者へ。同じ人の未読のいいね通知があれば増やさない） */
export function notifyLike({ articleId, actorId }: { articleId: string; actorId: string }) {
  return safely("liked", async () => {
    const a = await articleTitle(articleId);
    if (!a || a.authorId === actorId) return;
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
    const dup = await prisma.notification.findFirst({
      where: { userId: a.authorId, type: "liked", articleId, readAt: null, payload: { path: ["actorId"], equals: actorId } },
      select: { id: true },
    });
    if (!dup) await create(a.authorId, "liked", articleId, { title: a.title, actorId, actorName: actor?.name ?? null });
  });
}

/** コメントされた（著者へ。本人のコメントは除く） */
export function notifyComment({ articleId, commentId, actorId }: { articleId: string; commentId: string; actorId: string }) {
  return safely("commented", async () => {
    const a = await articleTitle(articleId);
    if (!a || a.authorId === actorId) return;
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
    await create(a.authorId, "commented", articleId, { title: a.title, actorName: actor?.name ?? null, commentId });
  });
}

/** 要確認コメントがある（admin へ） */
export function notifyAdminsOfFlaggedComment({ articleId, commentId }: { articleId: string; commentId: string }) {
  return safely("comment_flagged", async () => {
    const a = await articleTitle(articleId);
    if (!a) return;
    for (const admin of await activeAdmins()) await create(admin.id, "comment_flagged", articleId, { title: a.title, commentId });
  });
}

/** 月間ベストに選ばれた（著者へ。Slack にも） */
export function notifyAward(articleId: string, month: string) {
  return safely("award", async () => {
    const a = await articleTitle(articleId);
    if (!a) return;
    await create(a.authorId, "award", articleId, { title: a.title, month });
    await slack({ kind: "award", title: a.title, url: articleUrl(articleId) });
  });
}
