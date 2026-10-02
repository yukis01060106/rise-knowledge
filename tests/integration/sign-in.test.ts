import { beforeEach, describe, expect, it } from "vitest";
import { isSignInAllowed } from "@/server/auth/sign-in";
import { createUser, resetDb } from "../helpers/db";

beforeEach(resetDb);

const googleProfile = (email: string, hd?: string) => ({ email, email_verified: true, ...(hd ? { hd } : {}) });

describe("SSO ログインの許可判定", () => {
  it("許可ドメインの Workspace アカウントは許可する", async () => {
    const email = "taro@risetech.example";
    expect(await isSignInAllowed({ provider: "google", email, profile: googleProfile(email, "risetech.example") })).toBe(true);
  });

  it("ドメイン外のアカウントは拒否する", async () => {
    const email = "taro@gmail.com";
    expect(await isSignInAllowed({ provider: "google", email, profile: googleProfile(email) })).toBe(false);
  });

  it("hd クレームがない（個人アカウント）なら、メールのドメインが一致しても拒否する", async () => {
    const email = "taro@risetech.example";
    expect(await isSignInAllowed({ provider: "google", email, profile: googleProfile(email) })).toBe(false);
  });

  it("メールが未検証なら拒否する", async () => {
    const email = "taro@risetech.example";
    const profile = { email, email_verified: false, hd: "risetech.example" };
    expect(await isSignInAllowed({ provider: "google", email, profile })).toBe(false);
  });

  it("設定と異なるプロバイダからのログインは拒否する", async () => {
    const email = "taro@risetech.example";
    expect(await isSignInAllowed({ provider: "github", email, profile: googleProfile(email, "risetech.example") })).toBe(false);
  });

  it("無効化されたユーザーは拒否する", async () => {
    const user = await createUser({ disabledAt: new Date() });
    const profile = googleProfile(user.email, "risetech.example");
    expect(await isSignInAllowed({ provider: "google", email: user.email, profile })).toBe(false);
  });
});
