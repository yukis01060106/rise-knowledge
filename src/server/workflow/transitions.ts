import type { VersionStatus } from "@/generated/prisma/enums";

/**
 * 版の状態遷移の一覧（docs/design/workflow.md）。DB のトリガー article_versions_guard と同じ内容。
 * ここにない遷移はすべてエラーにする。
 */
export const TRANSITIONS = {
  submit: { from: "draft", to: "ai_review" },
  aiPass: { from: "ai_review", to: "admin_review" },
  aiReject: { from: "ai_review", to: "rejected" },
  approve: { from: "admin_review", to: "published" },
  reject: { from: "admin_review", to: "rejected" },
  supersede: { from: "published", to: "superseded" },
} as const satisfies Record<string, { from: VersionStatus; to: VersionStatus }>;

export type TransitionName = keyof typeof TRANSITIONS;

export function canTransition(from: VersionStatus, to: VersionStatus): boolean {
  return Object.values(TRANSITIONS).some((t) => t.from === from && t.to === to);
}
