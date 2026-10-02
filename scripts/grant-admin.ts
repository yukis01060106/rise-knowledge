/**
 * 最初の管理者を登録するためのスクリプト（サーバーで DB に直接つなげる運用担当者だけが実行する）。
 * アプリ上での admin 昇格は既存 admin しかできないため、最初の 1 人だけはこれで登録する。
 * 有効な admin がすでにいる場合は何もしない。
 *
 *   npm run admin:grant -- someone@example.co.jp
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("使い方: npm run admin:grant -- <メールアドレス>");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const adminCount = await prisma.user.count({ where: { role: "admin", disabledAt: null } });
    if (adminCount > 0) {
      throw new Error("有効な admin がすでにいます。昇格はアプリのユーザー管理画面から行ってください。");
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("ユーザーが見つかりません。先に一度ログインしてもらってください。");

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { role: "admin" } }),
      prisma.auditLog.create({
        data: {
          actorType: "system",
          action: "role_changed",
          targetUserId: user.id,
          reason: "初期管理者の登録（scripts/grant-admin.ts）",
          metadata: { from: user.role, to: "admin" },
        },
      }),
    ]);
    console.log("admin に昇格しました");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
