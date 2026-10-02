import { execSync } from "node:child_process";
import { config } from "dotenv";

/** テスト用 DB（.env.test の DATABASE_URL）に未適用のマイグレーションを当てる。データは各テストの resetDb で消す */
export default function setup() {
  const env = config({ path: ".env.test", override: true, quiet: true }).parsed ?? {};
  if (!env.DATABASE_URL?.includes("test")) {
    throw new Error(".env.test の DATABASE_URL はテスト用 DB（名前に test を含む）を指定してください");
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, ...env }, stdio: "pipe" });
}
