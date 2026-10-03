import "server-only";
import { PgBoss } from "pg-boss";

/** ジョブキュー（pg-boss）。PostgreSQL の pgboss スキーマを使う */
export const QUEUES = { complianceCheck: "compliance-check", notifySlack: "notify-slack" } as const;

let started: Promise<PgBoss> | undefined;

export function getBoss(): Promise<PgBoss> {
  started ??= (async () => {
    const boss = new PgBoss(process.env.DATABASE_URL!);
    // 接続エラーなどはログに残す（中身に秘密情報を含めない）
    boss.on("error", (e) => console.error(`[jobs] error: ${e instanceof Error ? e.name : "unknown"}`));
    await boss.start();
    for (const name of Object.values(QUEUES)) await boss.createQueue(name);
    return boss;
  })();
  return started;
}

export async function enqueueComplianceCheck(versionId: string) {
  const boss = await getBoss();
  // 同じ版を二重に積まない
  await boss.send(QUEUES.complianceCheck, { versionId }, { singletonKey: versionId });
}
