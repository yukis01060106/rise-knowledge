"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/server/db";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { writeAuditLog } from "@/server/audit/log";
import { reviewComment } from "@/server/compliance";
import { blockingFindings, describePrescan, prescan } from "@/server/compliance/prescan";
import { notifyAdminsOfFlaggedComment, notifyComment, notifyLike } from "@/server/notifications";
import { normalizeTagName } from "@/lib/tags";
import { MAX_COMMENT_LENGTH } from "@/lib/articles";
import { RATE_LIMIT_MESSAGE, takeToken } from "@/server/rate-limit";

export type SocialResult = { ok: true; message?: string } | { ok: false; message: string; details?: string[] };

const id = z.uuid();

/** いいね・ストック・コメントできる記事（公開中で、緊急非公開でない）。それ以外は存在も知らせない */
async function visibleArticle(tx: Tx | typeof prisma, articleId: string) {
  if (!id.safeParse(articleId).success) return null;
  return tx.article.findFirst({
    where: { id: articleId, publishedVersionId: { not: null }, hiddenAt: null },
    select: { id: true, authorId: true, publishedVersion: { select: { title: true, showInitials: true } } },
  });
}

/** いいね（もう一度押すと取り消し）。自分の記事にはできない */
export async function toggleLike(articleId: string): Promise<SocialResult & { liked?: boolean; count?: number }> {
  const user = await requireUser();
  if (!takeToken("like", user.id)) return { ok: false, message: RATE_LIMIT_MESSAGE };
  const article = await visibleArticle(prisma, articleId);
  if (!article) return { ok: false, message: "記事が見つかりません" };
  if (article.authorId === user.id) return { ok: false, message: "自分の記事にはいいねできません" };

  const existing = await prisma.like.findUnique({ where: { userId_articleId: { userId: user.id, articleId } } });
  let liked: boolean;
  if (existing) {
    await prisma.like.deleteMany({ where: { userId: user.id, articleId } });
    liked = false;
  } else {
    try {
      await prisma.like.create({ data: { userId: user.id, articleId } });
    } catch (e) {
      // 連打などで同時に押された（主キーで重複を防いでいる）
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
    liked = true;
    await notifyLike({ articleId, actorId: user.id });
  }
  const count = await prisma.like.count({ where: { articleId } });
  revalidatePath(`/articles/${articleId}`);
  return { ok: true, liked, count };
}

/** ストック（もう一度押すと取り消し） */
export async function toggleStock(articleId: string): Promise<SocialResult & { stocked?: boolean }> {
  const user = await requireUser();
  const article = await visibleArticle(prisma, articleId);
  if (!article) return { ok: false, message: "記事が見つかりません" };
  const deleted = await prisma.stock.deleteMany({ where: { userId: user.id, articleId } });
  if (deleted.count === 0) {
    await prisma.stock.upsert({
      where: { userId_articleId: { userId: user.id, articleId } },
      update: {},
      create: { userId: user.id, articleId },
    });
  }
  revalidatePath("/me/stocks");
  return { ok: true, stocked: deleted.count === 0 };
}

const commentSchema = z.object({
  articleId: z.uuid(),
  body: z.string().trim().min(1, "コメントを入力してください").max(MAX_COMMENT_LENGTH, `コメントは ${MAX_COMMENT_LENGTH} 文字以内にしてください`),
});

/**
 * コメントを投稿する。事前スキャンで止めるべき文字列があれば保存しない。
 * AI チェック：low は表示、medium・失敗は表示して管理者の確認待ち、high は投稿させない（監査のため blocked で残す）。
 */
export async function postComment(_prev: SocialResult | null, formData: FormData): Promise<SocialResult> {
  const user = await requireUser();
  if (!takeToken("comment", user.id)) return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = commentSchema.safeParse({ articleId: formData.get("articleId"), body: formData.get("body") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力が不正です" };
  const { articleId, body } = parsed.data;
  const article = await visibleArticle(prisma, articleId);
  if (!article) return { ok: false, message: "記事が見つかりません" };

  const blocked = blockingFindings(prescan("", body));
  if (blocked.length > 0) {
    await prisma.$transaction((tx) =>
      writeAuditLog(tx, { actorId: user.id, action: "comment_blocked", articleId, metadata: { by: "prescan", findings: blocked } }),
    );
    return {
      ok: false,
      message: "公開できない情報（パスワード・API キー・秘密鍵など）が含まれているため、投稿できません",
      details: blocked.map(describePrescan),
    };
  }

  const review = await reviewComment(article.publishedVersion?.title ?? "", body);
  const status = review.kind === "ok" ? "visible" : review.kind === "flag" ? "flagged" : "blocked";
  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.comment.create({ data: { articleId, authorId: user.id, bodyMd: body, status }, select: { id: true } });
    await tx.complianceCheck.update({ where: { id: review.checkId }, data: { commentId: c.id } });
    if (status !== "visible") {
      await writeAuditLog(tx, {
        actorId: null,
        action: status === "blocked" ? "comment_blocked" : "comment_flagged",
        articleId,
        commentId: c.id,
        metadata: { by: "ai", checkId: review.checkId, reason: review.kind === "flag" ? review.reason : "high" },
      });
    }
    return c;
  });

  if (review.kind === "block") {
    return {
      ok: false,
      message: `AI チェックで公開前に直すべき点が見つかったため、投稿できませんでした。${review.summary}`,
      details: review.suggestions,
    };
  }
  if (status === "flagged") await notifyAdminsOfFlaggedComment({ articleId, commentId: comment.id });
  await notifyComment({ articleId, commentId: comment.id, actorId: user.id });
  revalidatePath(`/articles/${articleId}`);
  return { ok: true, message: status === "flagged" ? "投稿しました（管理者が内容を確認します）" : "投稿しました" };
}

/** コメントの削除。投稿者本人か admin。admin が他人のコメントを消したら監査ログに残す */
export async function deleteComment(commentId: string): Promise<SocialResult> {
  const user = await requireUser();
  if (!id.safeParse(commentId).success) return { ok: false, message: "コメントが見つかりません" };
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorId: true, articleId: true, status: true } });
  if (!comment || comment.status === "deleted" || comment.status === "blocked") return { ok: false, message: "コメントが見つかりません" };
  const isOwner = comment.authorId === user.id;
  if (!isOwner && user.role !== "admin") return { ok: false, message: "このコメントは削除できません" };

  await prisma.$transaction(async (tx) => {
    await tx.comment.update({ where: { id: commentId }, data: { status: "deleted" } });
    if (!isOwner) {
      await writeAuditLog(tx, { actorId: user.id, action: "comment_deleted", articleId: comment.articleId, commentId });
    }
  });
  revalidatePath(`/articles/${comment.articleId}`);
  revalidatePath("/admin/comments");
  return { ok: true, message: "削除しました" };
}

/** 要確認コメントを「問題なし」にする（admin） */
export async function approveComment(commentId: string): Promise<SocialResult> {
  const admin = await requireAdmin();
  if (!id.safeParse(commentId).success) return { ok: false, message: "コメントが見つかりません" };
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.comment.updateMany({ where: { id: commentId, status: "flagged" }, data: { status: "visible" } });
    if (r.count === 1) {
      const c = await tx.comment.findUniqueOrThrow({ where: { id: commentId }, select: { articleId: true } });
      await writeAuditLog(tx, { actorId: admin.id, action: "comment_approved", articleId: c.articleId, commentId });
    }
    return r.count;
  });
  revalidatePath("/admin/comments");
  return updated === 1 ? { ok: true, message: "問題なしにしました" } : { ok: false, message: "すでに処理されています" };
}

/** タグのフォロー（もう一度押すと解除） */
export async function toggleFollowTag(tagName: string): Promise<SocialResult & { following?: boolean }> {
  const user = await requireUser();
  const tag = await prisma.tag.findUnique({ where: { name: normalizeTagName(String(tagName).slice(0, 60)) }, select: { id: true, name: true } });
  if (!tag) return { ok: false, message: "タグが見つかりません" };
  const deleted = await prisma.tagFollow.deleteMany({ where: { userId: user.id, tagId: tag.id } });
  if (deleted.count === 0) {
    await prisma.tagFollow.upsert({ where: { userId_tagId: { userId: user.id, tagId: tag.id } }, update: {}, create: { userId: user.id, tagId: tag.id } });
  }
  revalidatePath(`/tags/${encodeURIComponent(tag.name)}`);
  revalidatePath("/");
  return { ok: true, following: deleted.count === 0 };
}
