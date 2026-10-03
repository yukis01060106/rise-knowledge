"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireAdmin, requireUser } from "@/server/auth/guards";
import { writeAuditLog } from "@/server/audit/log";
import { parseInitials } from "@/lib/initials";

export type ActionState = { ok: boolean; message: string } | null;

const departmentSchema = z.object({ department: z.enum(["dev", "infra"]) });

/** 初回設定：自分の所属を登録する */
export async function updateMyDepartment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = departmentSchema.safeParse({ department: formData.get("department") });
  if (!parsed.success) return { ok: false, message: "所属を選択してください" };

  await prisma.user.update({ where: { id: user.id }, data: { department: parsed.data.department } });
  redirect("/");
}

const settingsSchema = z.object({
  department: z.enum(["dev", "infra"]),
  initials: z.string().max(20),
});

/** 設定：自分の所属とイニシャル */
export async function updateMySettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = settingsSchema.safeParse({
    department: formData.get("department"),
    initials: formData.get("initials") ?? "",
  });
  if (!parsed.success) return { ok: false, message: "入力が不正です" };

  let initials: string | null = null;
  if (parsed.data.initials.trim()) {
    const result = parseInitials(parsed.data.initials);
    if (!result.ok) return { ok: false, message: result.message };
    initials = result.value;
  } else {
    // イニシャル表示の記事があるのに消すと、表示する名前がなくなる
    const used = await prisma.articleVersion.count({ where: { createdBy: user.id, showInitials: true } });
    if (used > 0) return { ok: false, message: "イニシャル表示の記事があるため、イニシャルは空にできません（変更はできます）" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { department: parsed.data.department, initials } });
  revalidatePath("/", "layout");
  return { ok: true, message: initials ? `保存しました（イニシャル：${initials}）` : "保存しました" };
}

const roleSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["member", "admin"]),
});

/** ロールの変更（admin のみ）。自分自身のロールは変更できない */
export async function changeUserRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = roleSchema.safeParse({ userId: formData.get("userId"), role: formData.get("role") });
  if (!parsed.success) return { ok: false, message: "入力が不正です" };
  const { userId, role } = parsed.data;

  // 誤操作で管理者が 0 人になるのを防ぐ
  if (userId === actor.id) return { ok: false, message: "自分自身のロールは変更できません" };

  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true, disabledAt: true } });
    if (!target) return { ok: false, message: "ユーザーが見つかりません" };
    if (target.disabledAt) return { ok: false, message: "無効化されたユーザーのロールは変更できません" };
    if (target.role === role) return { ok: true, message: "変更はありません" };

    await tx.user.update({ where: { id: userId }, data: { role } });
    await writeAuditLog(tx, {
      actorId: actor.id,
      action: "role_changed",
      targetUserId: userId,
      metadata: { from: target.role, to: role },
    });
    return { ok: true, message: "ロールを変更しました" };
  });

  revalidatePath("/admin/users");
  return result;
}

const disableSchema = z.object({
  userId: z.uuid(),
  disabled: z.enum(["true", "false"]).transform((v) => v === "true"),
  reason: z.string().trim().max(500).optional(),
});

/** ユーザーの無効化／有効化（admin のみ）。無効化したらセッションも消す */
export async function setUserDisabled(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = disableSchema.safeParse({
    userId: formData.get("userId"),
    disabled: formData.get("disabled"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: "入力が不正です" };
  const { userId, disabled, reason } = parsed.data;

  if (userId === actor.id) return { ok: false, message: "自分自身は無効化できません" };

  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { disabledAt: true } });
    if (!target) return { ok: false, message: "ユーザーが見つかりません" };
    if (Boolean(target.disabledAt) === disabled) return { ok: true, message: "変更はありません" };

    await tx.user.update({ where: { id: userId }, data: { disabledAt: disabled ? new Date() : null } });
    if (disabled) await tx.session.deleteMany({ where: { userId } });
    await writeAuditLog(tx, {
      actorId: actor.id,
      action: disabled ? "user_disabled" : "user_enabled",
      targetUserId: userId,
      reason: reason || undefined,
    });
    return { ok: true, message: disabled ? "ユーザーを無効化しました" : "ユーザーを有効化しました" };
  });

  revalidatePath("/admin/users");
  return result;
}
