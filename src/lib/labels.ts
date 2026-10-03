import type { Department, Role, VersionStatus } from "@/generated/prisma/enums";

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

/** 作業中の版の状態（1 記事につき 1 つまで。DB の部分ユニークインデックスと同じ定義） */
export const WORKING_STATUSES = ["draft", "ai_review", "admin_review", "rejected"] as const satisfies readonly VersionStatus[];

/** 審査に出した版の状態（内容を変更しない） */
export const SUBMITTED_STATUSES = ["ai_review", "admin_review"] as const satisfies readonly VersionStatus[];
