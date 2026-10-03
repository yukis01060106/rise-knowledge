import "server-only";
import { forbidden } from "next/navigation";
import type { Prisma, Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { cardSelect, toCard, type ArticleCard } from "@/server/articles/queries";
import { addMonths, monthDate, monthOf, monthRange } from "@/lib/month";

type Viewer = { id: string; role: Role };

const visible = { publishedVersionId: { not: null }, hiddenAt: null } satisfies Prisma.ArticleWhereInput;

export type RankedArticle = ArticleCard & { monthLikes: number };
export type RankedAuthor = { id: string; name: string | null; department: "dev" | "infra" | null; monthLikes: number; posts: number };

/**
 * 月間ランキング（その月についたいいねの数）。
 * - 記事：イニシャル表示の記事も入れる（表示はイニシャルのまま）
 * - 投稿者：イニシャル表示の記事は数えない（実名にひもづけないため）
 */
export async function monthlyRanking(month: string, limit = 10) {
  const { start, end } = monthRange(month);
  const likesInMonth = { createdAt: { gte: start, lt: end } };

  const topArticles = await prisma.like.groupBy({
    by: ["articleId"],
    where: { ...likesInMonth, article: visible },
    _count: { articleId: true },
    orderBy: [{ _count: { articleId: "desc" } }, { articleId: "asc" }],
    take: limit,
  });
  const rows = await prisma.article.findMany({ where: { id: { in: topArticles.map((t) => t.articleId) } }, select: cardSelect });
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  const articles: RankedArticle[] = topArticles.flatMap((t) => {
    const card = byId.get(t.articleId);
    return card ? [{ ...card, monthLikes: t._count.articleId }] : [];
  });

  // 投稿者：イニシャル表示でない公開記事への、その月のいいね
  const authorRows = await prisma.$queryRaw<{ id: string; name: string | null; department: "dev" | "infra" | null; likes: bigint }[]>`
    SELECT u.id, u.name, u.department, count(*) AS likes
    FROM likes l
    JOIN articles a ON a.id = l.article_id
    JOIN article_versions v ON v.id = a.published_version_id
    JOIN users u ON u.id = a.author_id
    WHERE l.created_at >= ${start} AND l.created_at < ${end}
      AND a.hidden_at IS NULL AND v.show_initials = false
    GROUP BY u.id
    ORDER BY likes DESC, u.name
    LIMIT ${limit}`;
  const posts = await prisma.article.groupBy({
    by: ["authorId"],
    where: { ...visible, firstPublishedAt: { gte: start, lt: end }, publishedVersion: { showInitials: false } },
    _count: { authorId: true },
  });
  const postCount = new Map(posts.map((p) => [p.authorId, p._count.authorId]));
  const authors: RankedAuthor[] = authorRows.map((r) => ({
    id: r.id,
    name: r.name,
    department: r.department,
    monthLikes: Number(r.likes),
    posts: postCount.get(r.id) ?? 0,
  }));

  const award = await prisma.monthlyAward.findUnique({
    where: { month: monthDate(month) },
    select: { articleId: true, comment: true, article: { select: { hiddenAt: true } } },
  });

  return { articles, authors, award: award && !award.article.hiddenAt ? { articleId: award.articleId, comment: award.comment } : null };
}

/** 表彰された記事（記事ページ・カードのバッジ用） */
export async function awardMonthsFor(articleId: string): Promise<string[]> {
  const rows = await prisma.monthlyAward.findMany({ where: { articleId }, orderBy: { month: "desc" }, select: { month: true } });
  return rows.map((r) => monthOf(new Date(r.month.getTime() + 9 * 3600_000)));
}

/** 最新の月間ベスト（トップに出す） */
export async function latestAward() {
  const award = await prisma.monthlyAward.findFirst({
    where: { article: visible },
    orderBy: { month: "desc" },
    select: { month: true, comment: true, article: { select: cardSelect } },
  });
  return award ? { month: monthOf(new Date(award.month.getTime() + 9 * 3600_000)), comment: award.comment, card: toCard(award.article) } : null;
}

/** サイト内通知（新しい順） */
export async function listNotifications(viewer: Viewer, limit = 50) {
  return prisma.notification.findMany({
    where: { userId: viewer.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, articleId: true, payload: true, readAt: true, createdAt: true },
  });
}

export async function unreadNotificationCount(viewer: Viewer) {
  return prisma.notification.count({ where: { userId: viewer.id, readAt: null } });
}

/** A01 管理者ダッシュボード */
export async function dashboardStats(viewer: Viewer, now = new Date()) {
  if (viewer.role !== "admin") forbidden();
  const thisMonth = monthOf(now);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, i - 5));
  const since = monthRange(months[0]).start;
  const last30 = new Date(now.getTime() - 30 * 86400_000);

  const published = await prisma.article.findMany({
    where: { ...visible, firstPublishedAt: { gte: since } },
    select: { firstPublishedAt: true, author: { select: { department: true } } },
  });
  const byMonth = months.map((m) => {
    const inMonth = published.filter((p) => p.firstPublishedAt && monthOf(p.firstPublishedAt) === m);
    return {
      month: m,
      dev: inMonth.filter((p) => p.author.department === "dev").length,
      infra: inMonth.filter((p) => p.author.department === "infra").length,
    };
  });

  // レビューにかかった時間（申請 → 管理者の判断）。直近 30 日に判断したもの
  const decided = await prisma.articleVersion.findMany({
    where: { decidedBy: { not: null }, decidedAt: { gte: last30 }, submittedAt: { not: null } },
    select: { submittedAt: true, decidedAt: true },
  });
  const hours = decided.map((v) => (v.decidedAt!.getTime() - v.submittedAt!.getTime()) / 3600_000);
  const avgReviewHours = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null;

  const [aiCompleted, aiFailed, autoRejected, pendingReviews, flaggedComments, activeUsers] = await Promise.all([
    prisma.auditLog.count({ where: { action: "ai_check_completed", createdAt: { gte: last30 } } }),
    prisma.auditLog.count({ where: { action: "ai_check_failed", createdAt: { gte: last30 } } }),
    prisma.auditLog.count({ where: { action: "auto_rejected", createdAt: { gte: last30 } } }),
    prisma.articleVersion.count({ where: { status: "admin_review" } }),
    prisma.comment.count({ where: { status: "flagged" } }),
    prisma.user.count({ where: { disabledAt: null, lastLoginAt: { gte: last30 } } }),
  ]);
  const aiTotal = aiCompleted + aiFailed;

  return {
    months: byMonth,
    publishedThisMonth: byMonth[byMonth.length - 1].dev + byMonth[byMonth.length - 1].infra,
    avgReviewHours,
    reviewsDecided: decided.length,
    autoRejectRate: aiCompleted > 0 ? autoRejected / aiCompleted : null,
    aiFailRate: aiTotal > 0 ? aiFailed / aiTotal : null,
    aiTotal,
    pendingReviews,
    flaggedComments,
    activeUsers,
  };
}
