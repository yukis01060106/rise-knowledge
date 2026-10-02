import { describe, expect, it } from "vitest";
import { isAllowedEmail } from "@/server/auth/allowlist";
import { safeCallbackPath } from "@/lib/safe-redirect";

describe("isAllowedEmail", () => {
  const domains = ["risetech.example"];

  it("許可ドメインのメールを通す（大文字小文字は区別しない）", () => {
    expect(isAllowedEmail("taro@risetech.example", domains)).toBe(true);
    expect(isAllowedEmail("Taro@RiseTech.Example", domains)).toBe(true);
  });

  it.each([
    ["ドメイン外", "taro@gmail.com"],
    ["サブドメイン", "taro@sub.risetech.example"],
    ["末尾が似ているドメイン", "taro@evilrisetech.example"],
    ["許可ドメインを含む別ドメイン", "taro@risetech.example.attacker.com"],
    ["@ が 2 つ", "taro@risetech.example@gmail.com"],
    ["@ なし", "risetech.example"],
    ["空文字", ""],
    ["null", null],
  ])("%s は拒否する", (_label, email) => {
    expect(isAllowedEmail(email, domains)).toBe(false);
  });
});

describe("safeCallbackPath", () => {
  it("サイト内の相対パスはそのまま返す", () => {
    expect(safeCallbackPath("/admin/users?x=1")).toBe("/admin/users?x=1");
  });

  it.each(["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", undefined])(
    "%s はトップに置き換える",
    (value) => {
      expect(safeCallbackPath(value)).toBe("/");
    },
  );
});
