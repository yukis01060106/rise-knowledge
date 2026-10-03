import type { AuditAction, Department, Role, VersionStatus } from "@/generated/prisma/enums";

export const DEPARTMENT_LABELS: Record<Department, string> = {
  dev: "開発部",
  infra: "インフラ部",
};

export const ROLE_LABELS: Record<Role, string> = {
  member: "メンバー",
  admin: "管理者",
};

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  draft: "下書き",
  ai_review: "AI チェック中",
  admin_review: "管理者の確認待ち",
  published: "公開中",
  rejected: "差し戻し",
  superseded: "過去の版",
};

/** 進行中の版の状態（1 記事につき 1 つまで。DB の部分ユニークインデックスと同じ定義） */
export const IN_PROGRESS_STATUSES = ["draft", "ai_review", "admin_review"] as const satisfies readonly VersionStatus[];

/**
 * 著者に「作業中」として見せる版の状態。最新の版がこのどれかなら作業中の版とする
 * （差し戻された版は、著者が修正して新しい版を作るまで作業中として見せる）
 */
export const WORKING_STATUSES = [...IN_PROGRESS_STATUSES, "rejected"] as const satisfies readonly VersionStatus[];

export function isWorkingStatus(status: VersionStatus): status is (typeof WORKING_STATUSES)[number] {
  return (WORKING_STATUSES as readonly VersionStatus[]).includes(status);
}

/** 審査に出した版の状態（内容を変更しない） */
export const SUBMITTED_STATUSES = ["ai_review", "admin_review"] as const satisfies readonly VersionStatus[];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  version_created: "版を作成",
  draft_discarded: "下書きを破棄",
  submitted: "レビュー申請",
  ai_check_completed: "AI チェック完了",
  ai_check_failed: "AI チェック失敗",
  auto_rejected: "AI による自動差し戻し",
  approved: "承認・公開",
  rejected: "差し戻し",
  article_hidden: "緊急非公開",
  article_unhidden: "再公開",
  role_changed: "ロール変更",
  user_disabled: "ユーザー無効化",
  user_enabled: "ユーザー有効化",
};
