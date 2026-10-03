import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { prisma, type Tx } from "@/server/db";
import { writeAuditLog } from "@/server/audit/log";
import { MAX_REASON_LENGTH } from "@/lib/articles";
import { TRANSITIONS, type TransitionName } from "./transitions";
import { blockingFindings, prescan, type PrescanFinding } from "@/server/compliance/prescan";
import { notifyApproved, notifyRejected, notifyReviewRequested } from "@/server/notifications";

/**
 * 記事のステートマシン。版の状態（status）と記事の公開状態はここだけで変更する
 * （docs/design/workflow.md）。権限の確認もここで行う（呼び出し側の requireAdmin とあわせて二重に確認する）。
 */

type Actor = { id: string; role: Role };


export type WorkflowErrorCode = "not_found" | "invalid_state" | "conflict" | "forbidden" | "self_approval" | "invalid";

export type WorkflowResult<T = object> = ({ ok: true } & T) | { ok: false; code: WorkflowErrorCode; message: string };

class WorkflowError extends Error {
  constructor(
    readonly code: WorkflowErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const NOT_FOUND = () => new WorkflowError("not_found", "記事が見つかりません");
const CONFLICT = () =>
  new WorkflowError("conflict", "ほかの操作と重なったため処理できませんでした。画面を再読み込みしてください");

/** 例外を画面に返せる結果に変える（WorkflowError 以外はそのまま投げる） */
async function run<T extends object>(fn: () => Promise<T>): Promise<WorkflowResult<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
}

function requireAdminActor(actor: Actor) {
  if (actor.role !== "admin") throw new WorkflowError("forbidden", "この操作は管理者だけが行えます");
}

function parseReason(reason: string | null | undefined): string {
  const r = (reason ?? "").trim();
  if (!r) throw new WorkflowError("invalid", "理由を入力してください");
  if (r.length > MAX_REASON_LENGTH) throw new WorkflowError("invalid", `理由は ${MAX_REASON_LENGTH} 文字以内にしてください`);
  return r;
}

/**
 * 状態を 1 つ進める。「現在の状態を条件にした UPDATE」なので、同時に操作されても片方しか成功しない
 */
async function move(
  tx: Tx,
  versionId: string,
  name: TransitionName,
  data: Omit<Prisma.ArticleVersionUncheckedUpdateManyInput, "status"> = {},
) {
  const { from, to } = TRANSITIONS[name];
  const { count } = await tx.articleVersion.updateMany({ where: { id: versionId, status: from }, data: { ...data, status: to } });
  if (count !== 1) throw CONFLICT();
}

/** 記事の行をロックして読む（同じ記事への操作を直列にする） */
async function lockArticle(tx: Tx, articleId: string) {
  const rows = await tx.$queryRaw<{ id: string; author_id: string; published_version_id: string | null; hidden_at: Date | null }[]>`
    SELECT id, author_id, published_version_id, hidden_at FROM articles WHERE id = ${articleId}::uuid FOR UPDATE`;
  return rows[0] ?? null;
}

async function latestVersion(tx: Tx, articleId: string) {
  return tx.articleVersion.findFirst({
    where: { articleId },
    orderBy: { versionNo: "desc" },
    select: { id: true, versionNo: true, status: true, title: true, bodyMd: true, showInitials: true, category: true },
  });
}

/** 記事をロックした後で、審査対象の版がまだ admin_review かを確かめる */
async function requireAdminReview(tx: Tx, versionId: string) {
  const v = await tx.articleVersion.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } });
  if (v.status !== "admin_review") {
    throw new WorkflowError("invalid_state", "この版はすでに処理されたか、審査待ちではありません");
  }
}

/** UUID でない値は DB に渡す前に弾く（キャストエラーを避ける） */
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * #5 レビュー申請（draft → ai_review）。著者だけ。タイトルと本文が空でないこと。
 * #5' 事前スキャンで止めるべき文字列（秘密鍵・API キーなど）があれば申請しない。止めたことは監査ログに残す。
 */
export async function submitForReview(
  actor: Actor,
  articleId: string,
): Promise<WorkflowResult<{ versionId: string }> | { ok: false; code: "prescan_blocked"; message: string; findings: PrescanFinding[] }> {
  if (!isUuid(articleId)) return { ok: false, code: "not_found", message: "記事が見つかりません" };
  try {
    type TxResult = { kind: "blocked"; blocked: PrescanFinding[] } | { kind: "submitted"; versionId: string };
    const result = await prisma.$transaction(async (tx): Promise<TxResult> => {
      const article = await lockArticle(tx, articleId);
      if (!article || article.author_id !== actor.id) throw NOT_FOUND();
      const version = await latestVersion(tx, articleId);
      if (!version || version.status !== "draft") {
        throw new WorkflowError("invalid_state", "レビュー申請できるのは下書きだけです");
      }
      if (!version.title.trim()) throw new WorkflowError("invalid", "タイトルを入力してください");
      if (!version.bodyMd.trim()) throw new WorkflowError("invalid", "本文を入力してください");
      if (!version.category) throw new WorkflowError("invalid", "大分類（開発・インフラ・キャリア）を選んでください");
      if (version.showInitials) {
        const author = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { initials: true } });
        if (!author.initials) throw new WorkflowError("invalid", "イニシャル表示にするには、先に設定画面でイニシャルを登録してください");
      }

      const blocked = blockingFindings(prescan(version.title, version.bodyMd));
      if (blocked.length > 0) {
        // 値そのものは残さない（何行目に・どの種類か だけ）
        await tx.complianceCheck.create({
          data: { targetType: "article_version", versionId: version.id, status: "blocked_by_prescan", prescanFindings: blocked, completedAt: new Date() },
        });
        await writeAuditLog(tx, {
          actorId: actor.id,
          action: "prescan_blocked",
          articleId,
          versionId: version.id,
          metadata: { versionNo: version.versionNo, findings: blocked },
        });
        return { kind: "blocked", blocked };
      }

      await move(tx, version.id, "submit", { submittedAt: new Date() });
      await writeAuditLog(tx, {
        actorId: actor.id,
        action: "submitted",
        articleId,
        versionId: version.id,
        metadata: { versionNo: version.versionNo },
      });
      return { kind: "submitted", versionId: version.id };
    });
    if (result.kind === "blocked") {
      return {
        ok: false,
        code: "prescan_blocked",
        message: "公開できない情報（パスワード・API キー・秘密鍵など）が含まれているため、申請できません。該当箇所を削除してください",
        findings: result.blocked,
      };
    }
    return { ok: true, versionId: result.versionId };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
}

export type AiCheckOutcome =
  /** medium / low：管理者の確認へ */
  | { kind: "passed"; metadata: Prisma.InputJsonValue }
  /** 3 回失敗：「AI チェック未実施」として管理者の確認へ */
  | { kind: "failed"; metadata: Prisma.InputJsonValue }
  /** high：自動で差し戻す */
  | { kind: "high"; reason: string; metadata: Prisma.InputJsonValue };

/**
 * #6〜8 AI チェックの結果を反映する（システムの操作）。AI が公開することはない（最大でも admin_review まで）。
 * すでに別の状態になっていたら（取り下げ・二重実行など）何もしない。
 */
export async function applyAiCheckResult(versionId: string, outcome: AiCheckOutcome): Promise<{ applied: boolean }> {
  const result = await prisma.$transaction(async (tx): Promise<{ applied: boolean; articleId?: string }> => {
    const version = await tx.articleVersion.findUnique({ where: { id: versionId }, select: { articleId: true, status: true } });
    if (!version) return { applied: false };
    await lockArticle(tx, version.articleId);
    const current = await tx.articleVersion.findUniqueOrThrow({ where: { id: versionId }, select: { status: true } });
    if (current.status !== "ai_review") return { applied: false };

    const base = { actorId: null, articleId: version.articleId, versionId };
    if (outcome.kind === "high") {
      await move(tx, versionId, "aiReject", { decidedAt: new Date(), rejectReason: outcome.reason });
      await writeAuditLog(tx, { ...base, action: "ai_check_completed", metadata: outcome.metadata });
      await writeAuditLog(tx, { ...base, action: "auto_rejected", reason: outcome.reason });
    } else {
      await move(tx, versionId, "aiPass", { aiCheckFailed: outcome.kind === "failed" });
      await writeAuditLog(tx, {
        ...base,
        action: outcome.kind === "failed" ? "ai_check_failed" : "ai_check_completed",
        metadata: outcome.metadata,
      });
    }
    return { applied: true, articleId: version.articleId };
  });
  if (result.applied && result.articleId) {
    if (outcome.kind === "high") await notifyRejected(result.articleId, outcome.reason, true);
    else await notifyReviewRequested(result.articleId, versionId);
  }
  return { applied: result.applied };
}

/** #9 承認して公開（admin_review → published）。著者本人は承認できない。旧公開版は superseded にする */
export function approveVersion(actor: Actor, versionId: string) {
  return run(async () => {
    requireAdminActor(actor);
    if (!isUuid(versionId)) throw NOT_FOUND();
    return prisma.$transaction(async (tx) => {
      const version = await tx.articleVersion.findUnique({ where: { id: versionId }, select: { articleId: true, versionNo: true } });
      if (!version) throw NOT_FOUND();
      const article = await lockArticle(tx, version.articleId);
      if (!article) throw NOT_FOUND();
      if (article.author_id === actor.id) {
        throw new WorkflowError("self_approval", "自分の記事は承認できません。ほかの管理者に依頼してください");
      }
      await requireAdminReview(tx, versionId);

      const now = new Date();
      await move(tx, versionId, "approve", { decidedAt: now, decidedBy: actor.id });
      const previous = article.published_version_id;
      if (previous) await move(tx, previous, "supersede");
      await tx.article.update({
        where: { id: article.id },
        data: {
          publishedVersionId: versionId,
          // 緊急非公開中なら hidden_at はそのまま（再公開されるまで表示しない）
          ...(previous === null && { firstPublishedAt: now }),
        },
      });
      await writeAuditLog(tx, {
        actorId: actor.id,
        action: "approved",
        articleId: article.id,
        versionId,
        metadata: { versionNo: version.versionNo, previousVersionId: previous },
      });
      return { articleId: article.id };
    }).then(async (r) => {
      await notifyApproved(r.articleId);
      return r;
    });
  });
}

/** #10 差し戻し（admin_review → rejected）。理由必須。著者本人は操作できない */
export function rejectVersion(actor: Actor, versionId: string, reasonInput: string | null | undefined) {
  return run(async () => {
    requireAdminActor(actor);
    const reason = parseReason(reasonInput);
    if (!isUuid(versionId)) throw NOT_FOUND();
    return prisma.$transaction(async (tx) => {
      const version = await tx.articleVersion.findUnique({ where: { id: versionId }, select: { articleId: true, versionNo: true } });
      if (!version) throw NOT_FOUND();
      const article = await lockArticle(tx, version.articleId);
      if (!article) throw NOT_FOUND();
      if (article.author_id === actor.id) {
        throw new WorkflowError("self_approval", "自分の記事は審査できません。ほかの管理者に依頼してください");
      }
      await requireAdminReview(tx, versionId);
      await move(tx, versionId, "reject", { decidedAt: new Date(), decidedBy: actor.id, rejectReason: reason });
      await writeAuditLog(tx, {
        actorId: actor.id,
        action: "rejected",
        articleId: article.id,
        versionId,
        reason,
        metadata: { versionNo: version.versionNo },
      });
      return { articleId: article.id };
    }).then(async (r) => {
      await notifyRejected(r.articleId, reason, false);
      return r;
    });
  });
}

/** #11 緊急非公開。理由必須。著者本人の admin も実行できる（安全側の操作のため） */
export function hideArticle(actor: Actor, articleId: string, reasonInput: string | null | undefined) {
  return run(async () => {
    requireAdminActor(actor);
    const reason = parseReason(reasonInput);
    if (!isUuid(articleId)) throw NOT_FOUND();
    return prisma.$transaction(async (tx) => {
      const article = await lockArticle(tx, articleId);
      if (!article) throw NOT_FOUND();
      if (!article.published_version_id) throw new WorkflowError("invalid_state", "公開されていない記事です");
      const { count } = await tx.article.updateMany({
        where: { id: articleId, hiddenAt: null },
        data: { hiddenAt: new Date(), hiddenBy: actor.id },
      });
      if (count !== 1) throw new WorkflowError("invalid_state", "すでに非公開になっています");
      await writeAuditLog(tx, { actorId: actor.id, action: "article_hidden", articleId, reason });
      return {};
    });
  });
}

/** #12 再公開。理由必須。著者本人は操作できない */
export function unhideArticle(actor: Actor, articleId: string, reasonInput: string | null | undefined) {
  return run(async () => {
    requireAdminActor(actor);
    const reason = parseReason(reasonInput);
    if (!isUuid(articleId)) throw NOT_FOUND();
    return prisma.$transaction(async (tx) => {
      const article = await lockArticle(tx, articleId);
      if (!article) throw NOT_FOUND();
      if (article.author_id === actor.id) {
        throw new WorkflowError("self_approval", "自分の記事は再公開できません。ほかの管理者に依頼してください");
      }
      const { count } = await tx.article.updateMany({
        where: { id: articleId, hiddenAt: { not: null } },
        data: { hiddenAt: null, hiddenBy: null },
      });
      if (count !== 1) throw new WorkflowError("invalid_state", "非公開になっていません");
      await writeAuditLog(tx, { actorId: actor.id, action: "article_unhidden", articleId, reason });
      return {};
    });
  });
}

/** #13 下書きの破棄。一度も審査に出していない記事（版が下書き 1 つだけ）なら記事ごと削除する */
export function discardDraft(actor: Actor, articleId: string) {
  return run(async () => {
    if (!isUuid(articleId)) throw NOT_FOUND();
    return prisma.$transaction(async (tx) => {
      const article = await lockArticle(tx, articleId);
      if (!article || article.author_id !== actor.id) throw NOT_FOUND();
      const version = await latestVersion(tx, articleId);
      if (!version || version.status !== "draft") throw new WorkflowError("invalid_state", "破棄できるのは下書きだけです");

      const versionCount = await tx.articleVersion.count({ where: { articleId } });
      const deleteArticle = versionCount === 1 && !article.published_version_id;
      await tx.articleVersion.delete({ where: { id: version.id } });
      if (deleteArticle) await tx.article.delete({ where: { id: articleId } });

      await writeAuditLog(tx, {
        actorId: actor.id,
        action: "draft_discarded",
        articleId,
        versionId: version.id,
        metadata: { versionNo: version.versionNo, articleDeleted: deleteArticle },
      });
      return { articleDeleted: deleteArticle };
    });
  });
}
