import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "@/server/env";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  resetEnvCache();
});

describe("環境変数の検証", () => {
  it("本番で開発用ログインを有効にすると起動できない", () => {
    Object.assign(process.env, { NODE_ENV: "production", AUTH_DEV_LOGIN: "true" });
    resetEnvCache();
    expect(() => getEnv()).toThrow(/AUTH_DEV_LOGIN/);
  });

  it("Entra ID でテナントを固定しない issuer は拒否する", () => {
    Object.assign(process.env, {
      AUTH_PROVIDER: "microsoft-entra-id",
      AUTH_MICROSOFT_ENTRA_ID_ISSUER: "https://login.microsoftonline.com/common/v2.0",
    });
    resetEnvCache();
    expect(() => getEnv()).toThrow(/テナント/);
  });

  it("エラーメッセージに秘密情報の値を含めない", () => {
    Object.assign(process.env, { AUTH_SECRET: "super-secret-value", AUTH_PROVIDER: "unknown" });
    resetEnvCache();
    expect(() => getEnv()).toThrow();
    try {
      getEnv();
    } catch (e) {
      expect(String(e)).not.toContain("super-secret-value");
    }
  });
});
