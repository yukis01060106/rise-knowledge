import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { applyAiCheckResult, type AiCheckOutcome } from "@/server/workflow";
import { COMPLIANCE_CONFIG } from "../../../config/compliance";
import { prescan } from "./prescan";
import { createClaudeReviewer, ReviewerError, type Reviewer, type ReviewOutput } from "./reviewer";

/**
 * 版の AI チェック（ai_review → admin_review / rejected）。
 * どの結果でも公開はしない。公開の判断はかならず管理者が行う（docs/design/workflow.md）。
 *
 * - 本番はジョブキュー（pg-boss）に積み、ワーカー（npm run worker）が実行する
 * - 開発・テストは COMPLIANCE_RUNNER=inline で、申請の処理の中でそのまま実行できる
 */

type Deps = { reviewer: Reviewer; sleep: (ms: number) => Promise<void> };

const defaultDeps = (): Deps => ({
  reviewer: createClaudeReviewer(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
});

let overrides: Partial<Deps> = {};

/** テスト用：LLM を偽物に差し替える（テストから外部 API を呼ばない） */
export function setComplianceDepsForTests(deps: Partial<Deps>) {
  overrides = deps;
}

function deps(): Deps {
  return { ...defaultDeps(), ...overrides };
}

/** 監査ログ・metadata に入れる形（記事本文の抜粋は入れない） */
function auditMetadata(checkId: string, out: ReviewOutput): Prisma.InputJsonValue {
  return {
    checkId,
    model: out.model,
    promptVersion: COMPLIANCE_CONFIG.promptVersion,
    riskLevel: out.riskLevel,
    summary: out.summary,
    findings: out.findings.map((f) => ({ line: f.line, type: f.type, suggestion: f.suggestion })),
  };
}

/** 自動差し戻しの理由（著者に表示する） */
function rejectReason(out: ReviewOutput) {
  const lines = out.findings
    .slice(0, 5)
    .map((f) => `・${f.line === null ? "" : f.line === 0 ? "タイトル：" : `${f.line} 行目：`}${f.suggestion}`);
  return [`AI チェックで公開前に直すべき点が見つかりました。${out.summary}`, ...lines].join("\n");
}

function shouldAutoReject(level: ReviewOutput["riskLevel"]) {
  return COMPLIANCE_CONFIG.autoRejectAt === "medium" ? level !== "low" : level === "high";
}

/**
 * 1 つの版を審査する。すでに ai_review でなければ何もしない。
 * 失敗したら設定の回数まで再試行し、それでも失敗したら「AI チェック未実施」として管理者の確認へ回す。
 */
export async function checkVersion(versionId: string): Promise<void> {
  const version = await prisma.articleVersion.findUnique({
    where: { id: versionId },
    select: { id: true, title: true, bodyMd: true, status: true },
  });
  if (!version || version.status !== "ai_review") return;

  const { reviewer, sleep } = deps();
  const check = await prisma.complianceCheck.create({
    data: {
      targetType: "article_version",
      versionId,
      status: "pending",
      // 警告（申請は止めない）だけが残っている。値そのものは保存しない
      prescanFindings: prescan(version.title, version.bodyMd),
      model: COMPLIANCE_CONFIG.model,
      promptVersion: COMPLIANCE_CONFIG.promptVersion,
    },
    select: { id: true },
  });

  let lastError: ReviewerError | undefined;
  for (let attempt = 1; attempt <= COMPLIANCE_CONFIG.maxAttempts; attempt++) {
    const started = Date.now();
    try {
      const out = await reviewer.review({ title: version.title, body: version.bodyMd });
      await prisma.complianceCheck.update({
        where: { id: check.id },
        data: {
          status: "succeeded",
          attempts: attempt,
          model: out.model,
          riskLevel: out.riskLevel,
          summary: out.summary,
          findings: out.findings,
          errorCode: null,
          completedAt: new Date(),
        },
      });
      const metadata = auditMetadata(check.id, out);
      const outcome: AiCheckOutcome = shouldAutoReject(out.riskLevel)
        ? { kind: "high", reason: rejectReason(out), metadata }
        : { kind: "passed", metadata };
      await applyAiCheckResult(versionId, outcome);
      console.info(`[compliance] version=${versionId} check=${check.id} risk=${out.riskLevel} findings=${out.findings.length} attempt=${attempt} ms=${Date.now() - started}`);
      return;
    } catch (e) {
      lastError = e instanceof ReviewerError ? e : new ReviewerError("api_error", true);
      await prisma.complianceCheck.update({ where: { id: check.id }, data: { attempts: attempt, errorCode: lastError.code } });
      console.warn(`[compliance] version=${versionId} check=${check.id} attempt=${attempt} error=${lastError.code}`);
      if (!lastError.retryable || attempt === COMPLIANCE_CONFIG.maxAttempts) break;
      await sleep(COMPLIANCE_CONFIG.retryBaseDelayMs * 2 ** (attempt - 1));
    }
  }

  await prisma.complianceCheck.update({ where: { id: check.id }, data: { status: "failed", completedAt: new Date() } });
  await applyAiCheckResult(versionId, {
    kind: "failed",
    metadata: { checkId: check.id, errorCode: lastError?.code ?? "unknown", promptVersion: COMPLIANCE_CONFIG.promptVersion },
  });
}

/** 申請の直後に呼ぶ。設定によりジョブに積むか、その場で実行する */
export async function runComplianceCheck(versionId: string): Promise<void> {
  const mode = process.env.COMPLIANCE_RUNNER ?? (process.env.NODE_ENV === "production" ? "queue" : "inline");
  if (mode === "queue") {
    const { enqueueComplianceCheck } = await import("@/server/jobs/queue");
    await enqueueComplianceCheck(versionId);
    return;
  }
  await checkVersion(versionId);
}

/** 版の最新の AI チェック（管理者・著者の画面に出す） */
export async function latestCheckFor(versionId: string) {
  return prisma.complianceCheck.findFirst({
    where: { versionId, status: { in: ["succeeded", "failed"] } },
    orderBy: { createdAt: "desc" },
    select: { status: true, riskLevel: true, summary: true, findings: true, prescanFindings: true, model: true, errorCode: true, completedAt: true },
  });
}
