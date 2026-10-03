import { beforeEach, describe, expect, it } from "vitest";
import { LIMITS, resetRateLimits, takeToken } from "@/server/rate-limit";

beforeEach(resetRateLimits);

describe("レート制限", () => {
  it("上限までは通し、超えたら止める。時間がたてばまた通す", () => {
    const { max, windowMs } = LIMITS.comment;
    const t0 = 1_000_000;
    for (let i = 0; i < max; i++) expect(takeToken("comment", "u1", t0 + i)).toBe(true);
    expect(takeToken("comment", "u1", t0 + max)).toBe(false);
    // ほかの人・ほかの操作は別に数える
    expect(takeToken("comment", "u2", t0 + max)).toBe(true);
    expect(takeToken("like", "u1", t0 + max)).toBe(true);
    expect(takeToken("comment", "u1", t0 + windowMs + max)).toBe(true);
  });
});
