import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";

/** テスト用 DB を最新にして空にし、E2E 用の管理者とメンバーを用意する */
export default async function globalSetup() {
  const env = config({ path: ".env.test", quiet: true }).parsed ?? {};
  if (!env.DATABASE_URL?.includes("test")) throw new Error(".env.test の DATABASE_URL はテスト用 DB を指定してください");
  execSync("npx prisma migrate deploy", { env: { ...process.env, ...env }, stdio: "pipe" });

  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  try {
    await db.query("ALTER TABLE audit_logs DISABLE TRIGGER USER");
    await db.query(
      "TRUNCATE audit_logs, monthly_awards, notifications, likes, stocks, tag_follows, compliance_checks, comments, version_tags, tags, images, article_versions, articles, sessions, accounts, users CASCADE",
    );
    await db.query("ALTER TABLE audit_logs ENABLE TRIGGER USER");
    const insert = "INSERT INTO users (id, email, name, department, role, updated_at) VALUES ($1, $2, $3, $4, $5, now())";
    await db.query(insert, [randomUUID(), "e2e-admin@risetech.example", "E2E 管理者", "dev", "admin"]);
    await db.query(insert, [randomUUID(), "e2e-member@risetech.example", "E2E メンバー", "infra", "member"]);
  } finally {
    await db.end();
  }
}
