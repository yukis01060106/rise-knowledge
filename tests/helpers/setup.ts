import { config } from "dotenv";
import { beforeEach, vi } from "vitest";

config({ path: ".env.test", override: true, quiet: true });
// next.config.ts の experimental.authInterrupts に相当（forbidden() を使えるようにする）
process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS = "true";

// Auth.js の auth() はテストごとに差し替える（tests/helpers/auth.ts の loginAs）
vi.mock("@/server/auth/config", () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  SESSION_MAX_AGE_SECONDS: 60 * 60 * 24 * 7,
}));

// リクエストの外では revalidatePath が使えないため
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

// AI チェックはテストから外部 API を呼ばない。既定は「問題なし（low）」を返す偽物（各テストで差し替えられる）
process.env.COMPLIANCE_RUNNER = "inline";
beforeEach(async () => {
  const { setComplianceDepsForTests } = await import("@/server/compliance");
  setComplianceDepsForTests({
    reviewer: { review: async () => ({ riskLevel: "low", summary: "問題は見当たりません", findings: [], model: "fake-model" }) },
    sleep: async () => {},
  });
});
