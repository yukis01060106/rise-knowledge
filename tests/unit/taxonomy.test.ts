import { describe, expect, it } from "vitest";
import { describeFacets, groupFilter, parseFacets } from "@/lib/taxonomy";
import { excerptOf } from "@/lib/excerpt";

describe("記事の分類", () => {
  it("大分類で選べる属性だけを受け付け、定義順にそろえる", () => {
    expect(parseFacets("dev", ["dev.lang:java", "kind:trouble", "dev.lang:java"])).toEqual({
      ok: true,
      facets: ["kind:trouble", "dev.lang:java"],
    });
    expect(parseFacets("dev", ["infra.product:aws"]).ok).toBe(false);
    expect(parseFacets("dev", ["dev.lang:unknown"]).ok).toBe(false);
    expect(parseFacets(null, ["kind:howto"]).ok).toBe(false);
    expect(parseFacets(null, [])).toEqual({ ok: true, facets: [] });
  });

  it("絞り込みは軸ごとにまとめ、ほかの大分類の属性は無視する", () => {
    expect(groupFilter("dev", ["dev.lang:java", "dev.lang:python", "dev.phase:test", "infra.area:network"])).toEqual([
      ["dev.lang:java", "dev.lang:python"],
      ["dev.phase:test"],
    ]);
    expect(groupFilter(undefined, ["dev.lang:java"])).toEqual([]);
  });

  it("表示名にする", () => {
    expect(describeFacets("infra", ["infra.product:aws", "kind:howto"]).map((f) => `${f.groupLabel}/${f.label}`)).toEqual([
      "記事の種類/手順・Tips",
      "製品・サービス/AWS",
    ]);
  });

  it("抜粋は Markdown の記号やコードを除く", () => {
    expect(excerptOf("## 見出し\n\n本文の **強調** と `code`。\n\n```bash\nrm -rf /\n```\n\n- 箇条書き")).toBe("見出し 本文の 強調 と code。 箇条書き");
  });
});
