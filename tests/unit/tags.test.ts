import { describe, expect, it } from "vitest";
import { normalizeTagName, parseTags } from "@/lib/tags";

describe("タグ", () => {
  it("全角英数を半角に、小文字にする", () => {
    expect(normalizeTagName(" ＡＷＳ ")).toBe("aws");
    expect(normalizeTagName("C#")).toBe("c#");
  });

  it("空白・カンマ・読点で区切り、重複を除く（表記は最初のものを残す）", () => {
    expect(parseTags(["AWS aws、Terraform,初心者向け"])).toEqual({
      ok: true,
      tags: [
        { name: "aws", displayName: "AWS" },
        { name: "terraform", displayName: "Terraform" },
        { name: "初心者向け", displayName: "初心者向け" },
      ],
    });
  });

  it("6 個以上・長すぎる・使えない文字は拒否する", () => {
    expect(parseTags(["a b c d e f"]).ok).toBe(false);
    expect(parseTags(["a".repeat(31)]).ok).toBe(false);
    expect(parseTags(["a/b"]).ok).toBe(false);
    expect(parseTags(["<b>"]).ok).toBe(false);
    expect(parseTags(["Node.js C++ .NET"]).ok).toBe(true);
  });
});
