import { describe, expect, it } from "vitest";
import { diffStats, foldUnchanged, lineDiff } from "@/lib/diff";

describe("本文の差分", () => {
  it("追加・削除・変更なしの行と行番号を返す", () => {
    const d = lineDiff("a\nb\nc\n", "a\nB\nc\nd\n");
    expect(d.map((l) => `${l.kind}:${l.text}`)).toEqual(["same:a", "del:b", "add:B", "same:c", "add:d"]);
    expect(d[2]).toMatchObject({ oldNo: null, newNo: 2 });
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
  });

  it("変更のない長い部分は折りたたむ", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const after = before.replace("line10", "changed");
    const hunks = foldUnchanged(lineDiff(before, after), 2);
    expect(hunks[0]).toEqual({ skipped: 8 });
    expect("lines" in hunks[1] && hunks[1].lines.map((l) => l.text)).toEqual(["line8", "line9", "line10", "changed", "line11", "line12"]);
    expect(hunks[2]).toEqual({ skipped: 7 });
  });

  it("同じ本文なら変更なし", () => {
    expect(diffStats(lineDiff("x\n", "x\n"))).toEqual({ added: 0, removed: 0 });
  });
});
