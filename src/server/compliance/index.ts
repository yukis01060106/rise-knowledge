import "server-only";
import { applyAiCheckResult } from "@/server/workflow";

/**
 * 版の AI チェック（ai_review → admin_review / rejected）。
 * フェーズ 3 では仮実装として、チェックせずに管理者の確認へ進める。
 * フェーズ 4 で事前スキャン・Claude API・pg-boss のジョブに差し替える（呼び出し口はこのまま）。
 * どの結果でも公開はしない。公開の判断はかならず管理者が行う。
 */
export async function runComplianceCheck(versionId: string): Promise<void> {
  await applyAiCheckResult(versionId, { kind: "passed", metadata: { provisional: true } });
}
