import { describe, expect, it } from "vitest";
import { addMonths, isMonth, monthOf, monthRange } from "@/lib/month";

describe("月（日本時間）", () => {
  it("日本時間で月を判定する（UTC では前月末でも日本では翌月）", () => {
    expect(monthOf(new Date("2026-09-30T15:30:00Z"))).toBe("2026-10");
    expect(monthOf(new Date("2026-09-30T14:59:00Z"))).toBe("2026-09");
  });
  it("月の範囲は日本時間の 0 時から", () => {
    expect(monthRange("2026-10")).toEqual({ start: new Date("2026-09-30T15:00:00Z"), end: new Date("2026-10-31T15:00:00Z") });
  });
  it("年をまたいで前後の月を求める", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });
  it("形式を検証する", () => {
    expect(isMonth("2026-10")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("../x")).toBe(false);
  });
});
