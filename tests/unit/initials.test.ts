import { describe, expect, it } from "vitest";
import { parseInitials } from "@/lib/initials";

describe("イニシャル", () => {
  it("「K.T.」の形にそろえる", () => {
    expect(parseInitials("kt")).toEqual({ ok: true, value: "K.T." });
    expect(parseInitials("Ｋ．Ｔ")).toEqual({ ok: true, value: "K.T." });
    expect(parseInitials(" k. t. ")).toEqual({ ok: true, value: "K.T." });
    expect(parseInitials("Y")).toEqual({ ok: true, value: "Y." });
  });

  it("空・アルファベット以外・長すぎるものは拒否する", () => {
    expect(parseInitials("").ok).toBe(false);
    expect(parseInitials("山田").ok).toBe(false);
    expect(parseInitials("K1").ok).toBe(false);
    expect(parseInitials("ABCDE").ok).toBe(false);
  });
});
