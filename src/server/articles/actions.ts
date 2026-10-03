"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma, type Tx } from "@/server/db";
import { requireUser } from "@/server/auth/guards";
import { writeAuditLog } from "@/server/audit/log";
import { parseTags } from "@/lib/tags";
import { SUBMITTED_STATUSES } from "@/lib/labels";
import { MAX_BODY_LENGTH, MAX_TITLE_LENGTH } from "@/lib/articles";

const saveSchema = z.object({
  articleId: z.uuid().nullable(),
  title: z.string().trim().max(MAX_TITLE_LENGTH, `タイトルは ${MAX_TITLE_LENGTH} 文字以内にしてください`),
  bodyMd: z.string().max(MAX_BODY_LENGTH, `本文は ${MAX_BODY_LENGTH.toLocaleString()} 文字以内にしてください`),
  tags: z.array(z.string().max(200)).max(50),
  /** 著者名をイニシャルで表示する（設定画面でイニシャルを登録していること） */
  showInitials: z.boolean().default(false),
  /** 編集を始めたときの版の更新日時。別のタブなどで先に保存されていたら上書きしない */
  expectedUpdatedAt: z.iso.datetime().nullable(),
});

export type SaveDraftInput = z.input<typeof saveSchema>;

export type SaveDraftResult =
  | { ok: true; articleId: string; versionId: string; versionNo: number; updatedAt: string }
  | { ok: false; code: "invalid" | "not_found" | "locked" | "conflict"; message: string };

const NOT_FOUND = { ok: false, code: "not_found", message: "記事が見つかりません" } as const;
const CONFLICT = {
  ok: false,
  code: "conflict",
  message: "別の画面で先に保存されています。ページを再読み込みしてから編集してください",
} as const;

async function replaceTags(tx: Tx, versionId: string, tags: { name: string; displayName: string }[]) {
  await tx.versionTag.deleteMany({ where: { versionId } });
  for (const t of tags) {
    const tag = await tx.tag.upsert({ where: { name: t.name }, update: {}, create: t, select: { id: true } });
    await tx.versionTag.create({ data: { versionId, tagId: tag.id } });
  }
}

/**
 * 下書きを保存する（自動保存もこれを呼ぶ）。
 * - articleId なし：記事と最初の版（draft）を作る
 * - 最新の版が draft：その版を上書きする
 * - 最新の版が published / rejected（公開後の編集・差し戻し後の修正）：新しい draft 版を作る。
 *   公開中の版は承認されるまで表示し続け、差し戻された版はそのまま残す
 * - 審査中（ai_review / admin_review）：審査に出した版は変更しない
 * 版の状態（status）はここでは変えない。状態の遷移は src/server/workflow/ だけで行う。
 */
export async function saveDraft(input: SaveDraftInput): Promise<SaveDraftResult> {
  const user = await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: parsed.error.issues[0]?.message ?? "入力が不正です" };
  const tags = parseTags(parsed.data.tags);
  if (!tags.ok) return { ok: false, code: "invalid", message: tags.message };
  const { articleId, title, bodyMd, expectedUpdatedAt, showInitials } = parsed.data;
  if (showInitials && !user.initials) {
    return { ok: false, code: "invalid", message: "イニシャル表示にするには、先に設定画面でイニシャルを登録してください" };
  }

  try {
    return await prisma.$transaction(async (tx): Promise<SaveDraftResult> => {
      if (!articleId) {
        const article = await tx.article.create({ data: { authorId: user.id }, select: { id: true } });
        const version = await tx.articleVersion.create({
          data: { articleId: article.id, versionNo: 1, title, bodyMd, showInitials, createdBy: user.id },
          select: { id: true, versionNo: true, updatedAt: true },
        });
        await replaceTags(tx, version.id, tags.tags);
        await writeAuditLog(tx, {
          actorId: user.id,
          action: "version_created",
          articleId: article.id,
          versionId: version.id,
          metadata: { versionNo: 1 },
        });
        return { ok: true, articleId: article.id, versionId: version.id, versionNo: 1, updatedAt: version.updatedAt.toISOString() };
      }

      // 同じ記事への同時保存を直列にする（作業中の版の作成が二重にならないように）
      const locked = await tx.$queryRaw<{ author_id: string; published_version_id: string | null }[]>`
        SELECT author_id, published_version_id FROM articles WHERE id = ${articleId}::uuid FOR UPDATE`;
      const article = locked[0];
      // 他人の記事は存在も知らせない
      if (!article || article.author_id !== user.id) return NOT_FOUND;

      const latest = await tx.articleVersion.findFirst({
        where: { articleId },
        orderBy: { versionNo: "desc" },
        select: { id: true, status: true, versionNo: true, updatedAt: true },
      });

      if (latest && (SUBMITTED_STATUSES as readonly string[]).includes(latest.status)) {
        return { ok: false, code: "locked", message: "審査中の記事は編集できません" };
      }

      if (latest?.status === "draft") {
        if (expectedUpdatedAt && latest.updatedAt.toISOString() !== expectedUpdatedAt) return CONFLICT;
        const version = await tx.articleVersion.update({
          where: { id: latest.id },
          data: { title, bodyMd, showInitials },
          select: { id: true, versionNo: true, updatedAt: true },
        });
        await replaceTags(tx, version.id, tags.tags);
        await tx.article.update({ where: { id: articleId }, data: { updatedAt: new Date() } });
        return { ok: true, articleId, versionId: version.id, versionNo: version.versionNo, updatedAt: version.updatedAt.toISOString() };
      }

      // 新しい版を作る。差し戻し後の修正なら差し戻された版を、公開後の編集なら公開中の版を比較元にする
      const versionNo = (latest?.versionNo ?? 0) + 1;
      const basedOnVersionId = latest?.status === "rejected" ? latest.id : article.published_version_id;
      const version = await tx.articleVersion.create({
        data: {
          articleId,
          versionNo,
          title,
          bodyMd,
          showInitials,
          createdBy: user.id,
          basedOnVersionId,
        },
        select: { id: true, updatedAt: true },
      });
      await replaceTags(tx, version.id, tags.tags);
      await tx.article.update({ where: { id: articleId }, data: { updatedAt: new Date() } });
      await writeAuditLog(tx, {
        actorId: user.id,
        action: "version_created",
        articleId,
        versionId: version.id,
        metadata: { versionNo, basedOnVersionId },
      });
      return { ok: true, articleId, versionId: version.id, versionNo, updatedAt: version.updatedAt.toISOString() };
    });
  } catch (e) {
    // 作業中の版の一意制約（同時に新しい版を作ろうとした）
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return CONFLICT;
    throw e;
  }
}
