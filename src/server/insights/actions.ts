"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { writeAuditLog } from "@/server/audit/log";
import { notifyAward } from "@/server/notifications";
import { isMonth, monthDate } from "@/lib/month";

export type InsightResult = { ok: boolean; message: string } | null;

const awardSchema = z.object({
  month: z.string().refine(isMonth, "月の指定が不正です"),
  articleId: z.uuid(),
  comment: z.string().trim().max(300).optional(),
});

/** 月間ベストの表彰（admin）。1 か月に 1 本。表彰は監査ログに残し、著者に通知する */
export async function giveAward(_prev: InsightResult, formData: FormData): Promise<InsightResult> {
  const admin = await requireAdmin();
  const parsed = awardSchema.safeParse({
    month: formData.get("month"),
    articleId: formData.get("articleId"),
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "入力が不正です" };
  const { month, articleId, comment } = parsed.data;

  const article = await prisma.article.findFirst({ where: { id: articleId, publishedVersionId: { not: null }, hiddenAt: null }, select: { id: true } });
  if (!article) return { ok: false, message: "記事が見つかりません" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.monthlyAward.create({ data: { month: monthDate(month), articleId, awardedBy: admin.id, comment } });
      await writeAuditLog(tx, { actorId: admin.id, action: "award_given", articleId, metadata: { month } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, message: "この月はすでに表彰済みです" };
    throw e;
  }
  await notifyAward(articleId, month);
  revalidatePath("/admin/awards");
  revalidatePath("/rankings");
  revalidatePath("/");
  return { ok: true, message: "表彰しました" };
}

/** 自分の通知をすべて既読にする */
export async function markAllNotificationsRead(): Promise<void> {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
