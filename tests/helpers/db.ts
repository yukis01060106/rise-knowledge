import { prisma } from "@/server/db";
import type { Department, Role } from "@/generated/prisma/enums";

/**
 * テスト用 DB を空にする。監査ログは追記のみのトリガーがあるため、テストでだけ一時的に外す
 * （本番のアプリ用ロールはテーブルの所有者ではないので、この操作はできない）。
 */
export async function resetDb() {
  await prisma.$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER USER`;
  await prisma.$executeRaw`TRUNCATE audit_logs, notifications, likes, stocks, tag_follows, compliance_checks, comments, version_tags, tags, images, article_versions, articles, sessions, accounts, users CASCADE`;
  await prisma.$executeRaw`ALTER TABLE audit_logs ENABLE TRIGGER USER`;
}

let seq = 0;

export async function createUser(
  overrides: Partial<{ email: string; name: string; role: Role; department: Department | null; disabledAt: Date | null }> = {},
) {
  seq += 1;
  return prisma.user.create({
    data: {
      email: `user${seq}@risetech.example`,
      name: `テストユーザー${seq}`,
      department: "dev",
      ...overrides,
    },
  });
}
