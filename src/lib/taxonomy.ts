/**
 * 記事の分類（docs/design/taxonomy.md）。
 * - 大分類：記事ごとに 1 つ（書いた人の部署とは別）
 * - 軸ごとの属性：管理者が用意した選択肢から選ぶ（同じ軸の中は複数可）
 * - 自由タグ：これまでどおり自由に入力する細かいキーワード
 *
 * DB には「軸のキー:選択肢のキー」（例：dev.lang:java）だけを保存する。
 * キーは一度使ったら変えない（表示名は変えてよい）。選択肢を消すときは hidden にして残す。
 */

export const CATEGORY_KEYS = ["dev", "infra", "career"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export type FacetOption = { key: string; label: string; hidden?: boolean };
export type FacetGroup = { key: string; label: string; options: FacetOption[] };
export type Category = { key: CategoryKey; label: string; description: string; groups: FacetGroup[] };

/** どの大分類にも出す軸 */
export const COMMON_GROUPS: FacetGroup[] = [
  {
    key: "kind",
    label: "記事の種類",
    options: [
      { key: "howto", label: "手順・Tips" },
      { key: "trouble", label: "トラブル解決" },
      { key: "design", label: "設計・考え方" },
      { key: "learning", label: "学び・勉強会" },
      { key: "cert", label: "資格" },
    ],
  },
];

export const CATEGORIES: Category[] = [
  {
    key: "dev",
    label: "開発",
    description: "設計・実装・テストなど、ソフトウェア開発のナレッジ",
    groups: [
      {
        key: "dev.phase",
        label: "工程",
        options: [
          { key: "requirements", label: "要件定義" },
          { key: "design", label: "設計" },
          { key: "implementation", label: "実装" },
          { key: "test", label: "テスト" },
          { key: "release", label: "リリース" },
          { key: "maintenance", label: "保守・運用" },
        ],
      },
      {
        key: "dev.lang",
        label: "言語",
        options: [
          { key: "java", label: "Java" },
          { key: "csharp", label: "C# / .NET" },
          { key: "python", label: "Python" },
          { key: "js-ts", label: "JavaScript / TypeScript" },
          { key: "php", label: "PHP" },
          { key: "go", label: "Go" },
          { key: "ruby", label: "Ruby" },
          { key: "kotlin", label: "Kotlin" },
          { key: "swift", label: "Swift" },
          { key: "cobol", label: "COBOL" },
          { key: "sql", label: "SQL" },
          { key: "other", label: "その他" },
        ],
      },
      {
        key: "dev.area",
        label: "領域",
        options: [
          { key: "frontend", label: "フロントエンド" },
          { key: "backend", label: "バックエンド" },
          { key: "mobile", label: "モバイル" },
          { key: "data", label: "データ・AI" },
          { key: "tooling", label: "開発環境・ツール" },
        ],
      },
    ],
  },
  {
    key: "infra",
    label: "インフラ",
    description: "サーバー・ネットワーク・クラウドなど、基盤の構築と運用のナレッジ",
    groups: [
      {
        key: "infra.area",
        label: "領域",
        options: [
          { key: "server", label: "サーバー・OS" },
          { key: "network", label: "ネットワーク" },
          { key: "cloud", label: "クラウド" },
          { key: "database", label: "データベース" },
          { key: "security", label: "セキュリティ" },
          { key: "monitoring", label: "監視・運用" },
          { key: "container", label: "コンテナ・仮想化" },
        ],
      },
      {
        key: "infra.product",
        label: "製品・サービス",
        options: [
          { key: "aws", label: "AWS" },
          { key: "azure", label: "Azure" },
          { key: "gcp", label: "Google Cloud" },
          { key: "linux", label: "Linux" },
          { key: "windows-server", label: "Windows Server" },
          { key: "vmware", label: "VMware" },
          { key: "cisco", label: "Cisco" },
          { key: "other", label: "その他" },
        ],
      },
      {
        key: "infra.phase",
        label: "工程",
        options: [
          { key: "design", label: "設計" },
          { key: "build", label: "構築" },
          { key: "migration", label: "移行" },
          { key: "operation", label: "運用・保守" },
        ],
      },
    ],
  },
  {
    key: "career",
    label: "キャリア・働き方",
    description: "常駐先での工夫、コミュニケーション、資格、キャリアづくり",
    groups: [
      {
        key: "career.theme",
        label: "テーマ",
        options: [
          { key: "onsite", label: "常駐先での働き方" },
          { key: "communication", label: "コミュニケーション" },
          { key: "career", label: "キャリア" },
          { key: "newcomer", label: "新人・若手向け" },
          { key: "management", label: "リーダー・マネジメント" },
        ],
      },
    ],
  },
];

export const MAX_FACETS = 12;

export function categoryOf(key: string | null | undefined): Category | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

/** 大分類で選べる軸（共通の軸を先に） */
export function groupsFor(category: CategoryKey): FacetGroup[] {
  return [...COMMON_GROUPS, ...(categoryOf(category)?.groups ?? [])];
}

export const facetKey = (group: string, option: string) => `${group}:${option}`;

function splitFacet(value: string): [string, string] | null {
  const i = value.lastIndexOf(":");
  return i > 0 ? [value.slice(0, i), value.slice(i + 1)] : null;
}

export type FacetLabel = { key: string; groupKey: string; groupLabel: string; label: string };

/** 保存されている属性キーを表示用にする（未知のキーは出さない） */
export function describeFacets(category: CategoryKey | null | undefined, facets: readonly string[]): FacetLabel[] {
  if (!category) return [];
  const groups = groupsFor(category);
  const out: FacetLabel[] = [];
  for (const g of groups) {
    for (const o of g.options) {
      const key = facetKey(g.key, o.key);
      if (facets.includes(key)) out.push({ key, groupKey: g.key, groupLabel: g.label, label: o.label });
    }
  }
  return out;
}

export type ParsedFacets = { ok: true; facets: string[] } | { ok: false; message: string };

/**
 * 選ばれた属性を検証する。大分類で選べない軸・存在しない選択肢・非表示の選択肢は受け付けない。
 * 並びは定義順にそろえる（差分表示・比較を安定させるため）。
 */
export function parseFacets(category: CategoryKey | null, input: readonly string[]): ParsedFacets {
  const unique = [...new Set(input)];
  if (unique.length === 0) return { ok: true, facets: [] };
  if (!category) return { ok: false, message: "属性を選ぶ前に大分類を選んでください" };
  if (unique.length > MAX_FACETS) return { ok: false, message: `属性は ${MAX_FACETS} 個までです` };
  const allowed = groupsFor(category).flatMap((g) => g.options.filter((o) => !o.hidden).map((o) => facetKey(g.key, o.key)));
  for (const f of unique) {
    if (!splitFacet(f) || !allowed.includes(f)) return { ok: false, message: "選べない属性が含まれています" };
  }
  return { ok: true, facets: allowed.filter((f) => unique.includes(f)) };
}

/** 一覧の絞り込み条件（軸ごとに選ばれた属性）。同じ軸の中は「どれか」、軸どうしは「すべて」 */
export function groupFilter(category: CategoryKey | undefined, selected: readonly string[]): string[][] {
  if (!category) return [];
  const byGroup = new Map<string, string[]>();
  const valid = new Set(groupsFor(category).flatMap((g) => g.options.map((o) => facetKey(g.key, o.key))));
  for (const f of selected) {
    const parts = splitFacet(f);
    if (!parts || !valid.has(f)) continue;
    byGroup.set(parts[0], [...(byGroup.get(parts[0]) ?? []), f]);
  }
  return [...byGroup.values()];
}

export function isCategoryKey(v: unknown): v is CategoryKey {
  return typeof v === "string" && (CATEGORY_KEYS as readonly string[]).includes(v);
}
