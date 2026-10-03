/**
 * ジョブのワーカー（AI チェック・Slack 通知）。Web とは別のプロセスで動かす。
 *   npm run worker
 */
import "dotenv/config";
import { prisma } from "@/server/db";
import { getBoss, QUEUES } from "@/server/jobs/queue";
import { checkVersion } from "@/server/compliance";
import { sendSlackJob } from "@/server/notifications/slack";

async function main() {
  const boss = await getBoss();

  await boss.work<{ versionId: string }>(QUEUES.complianceCheck, async (jobs) => {
    for (const job of jobs) await checkVersion(job.data.versionId);
  });
  await boss.work<{ title: string; url: string; kind: string }>(QUEUES.notifySlack, async (jobs) => {
    for (const job of jobs) await sendSlackJob(job.data);
  });

  // ワーカーが止まっていた間に申請された版を拾い直す（審査の記録がない ai_review の版）
  const stuck = await prisma.articleVersion.findMany({
    where: { status: "ai_review", complianceChecks: { none: { status: { in: ["succeeded", "failed"] } } } },
    select: { id: true },
  });
  for (const v of stuck) await boss.send(QUEUES.complianceCheck, { versionId: v.id }, { singletonKey: v.id });

  console.info(`[worker] started (requeued=${stuck.length})`);
}

main().catch((e: unknown) => {
  console.error(`[worker] failed to start: ${e instanceof Error ? e.name : "unknown"}`);
  process.exit(1);
});
