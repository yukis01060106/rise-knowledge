"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { runComplianceCheck } from "@/server/compliance";
import { describePrescan } from "@/server/compliance/prescan";
import {
  approveVersion,
  discardDraft,
  hideArticle,
  rejectVersion,
  submitForReview,
  unhideArticle,
} from "@/server/workflow";

export type WorkflowActionState = { ok: boolean; message: string; details?: string[] } | null;

const id = z.uuid();

/** レビュー申請（著者）。申請後に AI チェックを始める */
export async function submitReviewAction(articleId: string): Promise<WorkflowActionState> {
  const user = await requireUser();
  if (!id.safeParse(articleId).success) return { ok: false, message: "記事が見つかりません" };
  const result = await submitForReview(user, articleId);
  if (!result.ok) {
    return { ok: false, message: result.message, details: "findings" in result ? result.findings.map(describePrescan) : undefined };
  }

  await runComplianceCheck(result.versionId);
  revalidatePath("/me/articles");
  revalidatePath(`/articles/${articleId}`);
  return { ok: true, message: "レビューを申請しました" };
}

/** 下書きの破棄（著者） */
export async function discardDraftAction(articleId: string): Promise<WorkflowActionState & { articleDeleted?: boolean }> {
  const user = await requireUser();
  if (!id.safeParse(articleId).success) return { ok: false, message: "記事が見つかりません" };
  const result = await discardDraft(user, articleId);
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/me/articles");
  return { ok: true, message: "下書きを破棄しました", articleDeleted: result.articleDeleted };
}

/** 承認して公開（admin） */
export async function approveAction(_prev: WorkflowActionState, formData: FormData): Promise<WorkflowActionState> {
  const admin = await requireAdmin();
  const result = await approveVersion(admin, String(formData.get("versionId") ?? ""));
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/admin/reviews");
  redirect("/admin/reviews?done=approved");
}

/** 差し戻し（admin、理由必須） */
export async function rejectAction(_prev: WorkflowActionState, formData: FormData): Promise<WorkflowActionState> {
  const admin = await requireAdmin();
  const result = await rejectVersion(admin, String(formData.get("versionId") ?? ""), formData.get("reason")?.toString());
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/admin/reviews");
  redirect("/admin/reviews?done=rejected");
}

/** 緊急非公開・再公開（admin、理由必須） */
export async function setArticleHiddenAction(_prev: WorkflowActionState, formData: FormData): Promise<WorkflowActionState> {
  const admin = await requireAdmin();
  const articleId = String(formData.get("articleId") ?? "");
  const reason = formData.get("reason")?.toString();
  const hide = formData.get("hidden") === "true";
  const result = hide ? await hideArticle(admin, articleId, reason) : await unhideArticle(admin, articleId, reason);
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/admin/articles");
  return { ok: true, message: hide ? "記事を非公開にしました" : "記事を再公開しました" };
}
