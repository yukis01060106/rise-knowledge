import "server-only";
import { forbidden } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction, Role, VersionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";

/**
 * 管理者向けの取得。ページ側の requireAdmin に加えて、ここでもロールを確認する。
 * 管理者が見られるのは審査に出た版（ai_review 以降）だけ。他人の draft は見られない。
 */

type AdminViewer = { id: string; role: Role };

function assertAdmin(viewer: AdminViewer) {
  if (viewer.role !== "admin") forbidden();
}

const SUBMITTED: VersionStatus[] = ["ai_review", "admin_review", "published", "rejected", "superseded"];

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export type PendingReview = {
  versionId: string;
  articleId: string;
  versionNo: number;
  title: string;
  submittedAt: Date | null;
  aiCheckFailed: boolean;
  showInitials: boolean;
  category: "dev" | "infra" | "career" | null;
  /** 公開済みの記事の更新か（初回公開でなければ true） */
  isUpdate: boolean;
  author: { id: string; name: string | null; department: "dev" | "infra" | null };
};

/** A02 レビュー待ち（admin_review）を申請の古い順に */
export async function listPendingReviews(viewer: AdminViewer): Promise<PendingReview[]> {
  assertAdmin(viewer);
  const rows = await prisma.articleVersion.findMany({
    where: { status: "admin_review" },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: 200,
    select: {
      id: true,
      articleId: true,
      versionNo: true,
      title: true,
      submittedAt: true,
      aiCheckFailed: true,
      showInitials: true,
      category: true,
      article: {
        select: { publishedVersionId: true, author: { select: { id: true, name: true, department: true } } },
      },
    },
  });
  return rows.map((r) => ({
    versionId: r.id,
    articleId: r.articleId,
    versionNo: r.versionNo,
    title: r.title,
    submittedAt: r.submittedAt,
    aiCheckFailed: r.aiCheckFailed,
    showInitials: r.showInitials,
    category: r.category,
    isUpdate: r.article.publishedVersionId !== null,
    author: r.article.author,
  }));
}

export async function countPendingReviews(viewer: AdminViewer) {
  assertAdmin(viewer);
  return prisma.articleVersion.count({ where: { status: "admin_review" } });
}

const reviewVersionSelect = {
  id: true,
  articleId: true,
  versionNo: true,
  title: true,
  bodyMd: true,
  status: true,
  aiCheckFailed: true,
  showInitials: true,
  category: true,
  facets: true,
  submittedAt: true,
  decidedAt: true,
  rejectReason: true,
  decider: { select: { id: true, name: true } },
  tags: { select: { tag: { select: { name: true, displayName: true } } } },
} satisfies Prisma.ArticleVersionSelect;

type ReviewVersionRow = Prisma.ArticleVersionGetPayload<{ select: typeof reviewVersionSelect }>;

export type ReviewVersion = Omit<ReviewVersionRow, "tags"> & { tags: { name: string; displayName: string }[] };

const toReviewVersion = (v: ReviewVersionRow): ReviewVersion => ({ ...v, tags: v.tags.map((t) => t.tag) });

/**
 * A03 レビュー画面。審査に出た版と、比較対象（現在の公開版。初回公開ならなし）を返す。
 * draft の版は返さない（審査に出るまでは著者だけのもの）。
 */
export async function getVersionForReview(viewer: AdminViewer, versionId: string) {
  assertAdmin(viewer);
  if (!isUuid(versionId)) return null;
  const version = await prisma.articleVersion.findFirst({
    where: { id: versionId, status: { in: SUBMITTED } },
    select: {
      ...reviewVersionSelect,
      basedOn: { select: reviewVersionSelect },
      article: {
        select: {
          id: true,
          hiddenAt: true,
          author: { select: { id: true, name: true, initials: true, department: true } },
          publishedVersion: { select: reviewVersionSelect },
        },
      },
    },
  });
  if (!version) return null;
  const { article, basedOn, ...rest } = version;
  const published = article.publishedVersion && article.publishedVersion.id !== version.id ? article.publishedVersion : null;
  return {
    version: toReviewVersion(rest),
    article: { id: article.id, hidden: article.hiddenAt !== null, author: article.author },
    /** 比較対象（現在公開中の版）。初回公開なら null */
    compareTo: published ? toReviewVersion(published) : null,
    /** 差し戻された版を修正した再申請なら、その差し戻された版（何が直ったかを見るため） */
    previousRejected: basedOn?.status === "rejected" ? toReviewVersion(basedOn) : null,
    isSelf: article.author.id === viewer.id,
  };
}

export type AdminArticleRow = {
  id: string;
  title: string;
  author: { id: string; name: string | null };
  publishedVersionNo: number | null;
  latestSubmitted: { versionNo: number; status: VersionStatus } | null;
  hidden: boolean;
  firstPublishedAt: Date | null;
  updatedAt: Date;
};

/** A04 記事管理。一度でも審査に出た記事だけ（他人の下書きしかない記事は出さない） */
export async function listArticlesForAdmin(viewer: AdminViewer, opts: { page?: number; filter?: "all" | "published" | "hidden" } = {}) {
  assertAdmin(viewer);
  const page = Math.max(1, opts.page ?? 1);
  const take = 30;
  const where: Prisma.ArticleWhereInput = {
    versions: { some: { status: { in: SUBMITTED } } },
    ...(opts.filter === "published" && { publishedVersionId: { not: null }, hiddenAt: null }),
    ...(opts.filter === "hidden" && { hiddenAt: { not: null } }),
  };
  const [rows, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        hiddenAt: true,
        firstPublishedAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true } },
        publishedVersion: { select: { title: true, versionNo: true } },
        versions: {
          where: { status: { in: SUBMITTED } },
          orderBy: { versionNo: "desc" },
          take: 1,
          select: { versionNo: true, status: true, title: true },
        },
      },
    }),
    prisma.article.count({ where }),
  ]);
  const items: AdminArticleRow[] = rows.map((r) => ({
    id: r.id,
    title: r.publishedVersion?.title ?? r.versions[0]?.title ?? "",
    author: r.author,
    publishedVersionNo: r.publishedVersion?.versionNo ?? null,
    latestSubmitted: r.versions[0] ? { versionNo: r.versions[0].versionNo, status: r.versions[0].status } : null,
    hidden: r.hiddenAt !== null,
    firstPublishedAt: r.firstPublishedAt,
    updatedAt: r.updatedAt,
  }));
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / take)) };
}

/** A05 版の履歴。審査に出た版（新しい順）と、記事の監査ログ */
export async function getArticleHistory(viewer: AdminViewer, articleId: string) {
  assertAdmin(viewer);
  if (!isUuid(articleId)) return null;
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      hiddenAt: true,
      publishedVersionId: true,
      author: { select: { id: true, name: true } },
      versions: {
        where: { status: { in: SUBMITTED } },
        orderBy: { versionNo: "desc" },
        select: reviewVersionSelect,
      },
    },
  });
  if (!article || article.versions.length === 0) return null;
  const logs = await prisma.auditLog.findMany({
    where: { articleId },
    orderBy: { id: "asc" },
    select: {
      id: true,
      action: true,
      versionId: true,
      reason: true,
      metadata: true,
      createdAt: true,
      actorType: true,
      actor: { select: { name: true, email: true } },
    },
  });
  return {
    id: article.id,
    hidden: article.hiddenAt !== null,
    publishedVersionId: article.publishedVersionId,
    author: article.author,
    versions: article.versions.map(toReviewVersion),
    logs,
  };
}

export const AUDIT_PAGE_SIZE = 50;

export type AuditLogFilter = {
  action?: AuditAction;
  articleId?: string;
  actorId?: string;
  /** Asia/Tokyo の日付（YYYY-MM-DD） */
  from?: string;
  to?: string;
  page?: number;
};

/** "YYYY-MM-DD"（日本時間）の 0 時を UTC の Date にする */
function tokyoDate(d: string, addDays = 0) {
  const t = new Date(`${d}T00:00:00+09:00`);
  if (Number.isNaN(t.getTime())) return undefined;
  t.setUTCDate(t.getUTCDate() + addDays);
  return t;
}

/** A08 監査ログ（閲覧のみ）。新しい順 */
export async function listAuditLogs(viewer: AdminViewer, filter: AuditLogFilter) {
  assertAdmin(viewer);
  const page = Math.max(1, filter.page ?? 1);
  const from = filter.from ? tokyoDate(filter.from) : undefined;
  const to = filter.to ? tokyoDate(filter.to, 1) : undefined;
  const where: Prisma.AuditLogWhereInput = {
    ...(filter.action && { action: filter.action }),
    ...(filter.articleId && isUuid(filter.articleId) && { articleId: filter.articleId }),
    ...(filter.actorId && isUuid(filter.actorId) && { actorId: filter.actorId }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } }),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        action: true,
        actorType: true,
        articleId: true,
        versionId: true,
        reason: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, name: true, email: true } },
        targetUser: { select: { name: true, email: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { items: rows, total, page, pageCount: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

/** 監査ログの絞り込み用：操作者の候補 */
export async function listUsersForFilter(viewer: AdminViewer) {
  assertAdmin(viewer);
  return prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, email: true } });
}
