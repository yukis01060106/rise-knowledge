import "server-only";
import { forbidden } from "next/navigation";
import type { Prisma, Role } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { cardSelect, toCard, toPublicAuthor, type ArticleCard, type PublicAuthor } from "@/server/articles/queries";
import { renderMarkdown, type SanitizedHtml } from "@/server/markdown/render";

type Viewer = { id: string; role: Role };

const visible = { publishedVersionId: { not: null }, hiddenAt: null } satisfies Prisma.ArticleWhereInput;

export type CommentView = {
  id: string;
  html: SanitizedHtml;
  createdAt: Date;
  flagged: boolean;
  deleted: boolean;
  author: PublicAuthor;
  canDelete: boolean;
};

/** 記事のいいね・ストック・コメント。記事が見られる人にだけ呼ぶ（ページ側で getArticleDetail を通した後） */
export async function getEngagement(viewer: Viewer, articleId: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { authorId: true, publishedVersion: { select: { showInitials: true } } },
  });
  if (!article) return null;
  const [likeCount, liked, stocked, comments] = await Promise.all([
    prisma.like.count({ where: { articleId } }),
    prisma.like.findUnique({ where: { userId_articleId: { userId: viewer.id, articleId } }, select: { userId: true } }),
    prisma.stock.findUnique({ where: { userId_articleId: { userId: viewer.id, articleId } }, select: { userId: true } }),
    prisma.comment.findMany({
      where: { articleId, status: { in: ["visible", "flagged", "deleted"] } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, bodyMd: true, status: true, createdAt: true, authorId: true, author: { select: { id: true, name: true, initials: true, department: true } } },
    }),
  ]);
  const authorHidesName = article.publishedVersion?.showInitials ?? false;
  const views: CommentView[] = await Promise.all(
    comments.map(async (c) => ({
      id: c.id,
      // 削除されたコメントは本文を出さない
      html: c.status === "deleted" ? ("" as SanitizedHtml) : await renderMarkdown(c.bodyMd),
      createdAt: c.createdAt,
      flagged: c.status === "flagged",
      deleted: c.status === "deleted",
      // イニシャル表示の記事では、著者本人のコメントもイニシャルにする（実名にひもづけない）
      author: toPublicAuthor(c.author, authorHidesName && c.authorId === article.authorId),
      canDelete: c.status !== "deleted" && (c.authorId === viewer.id || viewer.role === "admin"),
    })),
  );
  return {
    likeCount,
    liked: Boolean(liked),
    stocked: Boolean(stocked),
    canLike: article.authorId !== viewer.id,
    comments: views,
  };
}

/** 自分のストック（新しい順） */
export async function listStocks(viewer: Viewer): Promise<ArticleCard[]> {
  const rows = await prisma.stock.findMany({
    where: { userId: viewer.id, article: visible },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { article: { select: cardSelect } },
  });
  return rows.map((r) => toCard(r.article));
}

/** 今週のトレンド：直近 7 日のいいねが多い公開記事 */
export async function weeklyTrending(limit = 5): Promise<ArticleCard[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const top = await prisma.like.groupBy({
    by: ["articleId"],
    where: { createdAt: { gte: since }, article: visible },
    _count: { articleId: true },
    orderBy: { _count: { articleId: "desc" } },
    take: limit,
  });
  if (top.length === 0) return [];
  const rows = await prisma.article.findMany({ where: { id: { in: top.map((t) => t.articleId) } }, select: cardSelect });
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return top.flatMap((t) => byId.get(t.articleId) ?? []);
}

/** フォロー中のタグの新着 */
export async function followedTagFeed(viewer: Viewer, limit = 6) {
  const follows = await prisma.tagFollow.findMany({ where: { userId: viewer.id }, select: { tag: { select: { id: true, name: true, displayName: true } } } });
  if (follows.length === 0) return { tags: [], items: [] as ArticleCard[] };
  const rows = await prisma.article.findMany({
    where: { ...visible, publishedVersion: { tags: { some: { tagId: { in: follows.map((f) => f.tag.id) } } } } },
    orderBy: { firstPublishedAt: "desc" },
    take: limit,
    select: cardSelect,
  });
  return { tags: follows.map((f) => f.tag), items: rows.map(toCard) };
}

export async function isFollowingTag(viewer: Viewer, tagName: string) {
  const f = await prisma.tagFollow.findFirst({ where: { userId: viewer.id, tag: { name: tagName } }, select: { tagId: true } });
  return Boolean(f);
}

export async function followedTagNames(viewer: Viewer) {
  const rows = await prisma.tagFollow.findMany({ where: { userId: viewer.id }, select: { tag: { select: { name: true } } } });
  return new Set(rows.map((r) => r.tag.name));
}

/**
 * ユーザーページ。イニシャル表示の記事は出さず、いいねの合計にも含めない（実名にひもづけないため）。
 */
export async function getUserProfile(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, department: true, createdAt: true, disabledAt: true } });
  if (!user) return null;
  const where: Prisma.ArticleWhereInput = { authorId: id, ...visible, publishedVersion: { showInitials: false } };
  const [rows, likeTotal] = await Promise.all([
    prisma.article.findMany({ where, orderBy: { firstPublishedAt: "desc" }, take: 100, select: cardSelect }),
    prisma.like.count({ where: { article: where } }),
  ]);
  return { user, articles: rows.map(toCard), likeTotal };
}

/** 要確認コメント（admin） */
export async function listFlaggedComments(viewer: Viewer) {
  if (viewer.role !== "admin") forbidden();
  const rows = await prisma.comment.findMany({
    where: { status: "flagged" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      bodyMd: true,
      createdAt: true,
      articleId: true,
      author: { select: { name: true } },
      article: { select: { publishedVersion: { select: { title: true } } } },
      complianceChecks: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, riskLevel: true, summary: true, errorCode: true } },
    },
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      html: await renderMarkdown(r.bodyMd),
      createdAt: r.createdAt,
      articleId: r.articleId,
      articleTitle: r.article.publishedVersion?.title ?? "",
      authorName: r.author.name,
      check: r.complianceChecks[0] ?? null,
    })),
  );
}

export async function countFlaggedComments(viewer: Viewer) {
  if (viewer.role !== "admin") return 0;
  return prisma.comment.count({ where: { status: "flagged" } });
}
