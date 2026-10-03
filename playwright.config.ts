import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

/**
 * E2E テスト（npm run test:e2e）。テスト用 DB（.env.test）につないだ開発サーバーを 3100 番で起動して、ブラウザで操作する。
 * 開発用ログインで SSO を代わりにし、AI チェックはその場で実行する（API キーがなければ「未実施」として管理者の確認へ）。
 */
const testEnv = config({ path: ".env.test", quiet: true }).parsed ?? {};
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: `http://localhost:${PORT}`, locale: "ja-JP", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      ...testEnv,
      NEXT_DIST_DIR: ".next-e2e",
      AUTH_DEV_LOGIN: "true",
      AUTH_ALLOWED_DOMAINS: "risetech.example",
      COMPLIANCE_RUNNER: "inline",
      ANTHROPIC_API_KEY: "",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: ".data/e2e-uploads",
    },
  },
});
