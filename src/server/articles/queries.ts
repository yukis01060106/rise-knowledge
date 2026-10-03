import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { ArticleCategory, Department, Role, VersionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { normalizeTagName } from "@/lib/tags";
import { isWorkingStatus } from "@/lib/labels";
import { CATEGORY_KEYS, describeFacets, groupFilter, type CategoryKey, type FacetLabel } from "@/lib/taxonomy";
import { excerptOf, readingMinutes } from "@/lib/excerpt";
import { monthOf } from "@/lib/month";

/**
 * 記事の取得はかならずこのモジュールを通す（誰が・どの版を見てよいかをここで判定する）。
 * - 公開中の版：ログインしている全員（緊急非公開の記事は除く）
 * - 作業中の版（draft / ai_review / admin_review / rejected）：著者だけ
 *   （admin が審査中の版を見るのは src/server/articles/admin-queries.ts から）
 */

export const PAGE_SIZE = 20;

type Viewer = { id: string; role?: Role };

/** 一覧に出してよい記事（公開中かつ非公開化されていない） */
const visiblePublished = {
  publishedVersionId: { not: null },
  hiddenAt: null,
} satisfies Prisma.ArticleWhereInput;

export const cardSelect = {
  id: true,
  firstPublishedAt: true,
  author: { select: { id: true, name: true, initials: true, department: true } },
  _count: { select: { likes: true, comments: { where: { status: { in: ["visible", "flagged"] } } } } },
  awards: { select: { month: true }, orderBy: { month: "desc" }, take: 1 },
  publishedVersion: {
    select: {
      title: true,
      bodyMd: true,
      showInitials: true,
      category: true,
      facets: true,
      tags: { select: { tag: { select: { name: true, displayName: true } } } },
    },
  },
} satisfies Prisma.ArticleSelect;

type CardRow = Prisma.ArticleGetPayload<{ select: typeof cardSelect }>;

/**
 * 画面に出す著者。イニシャル表示の版では実名を含めない（ほかの人に返すデータに実名・ユーザー ID を載せない）
 */
export type PublicAuthor = {
  name: string;
  department: Department | null;
  isInitials: boolean;
  /** ユーザーページへのリンク用。イニシャル表示のときは null（実名にひもづけない） */
  profileId: string | null;
};

export function toPublicAuthor(
  author: { id: string; name: string | null; initials: string | null; department: Department | null },
  showInitials: boolean,
): PublicAuthor {
  if (showInitials) return { name: author.initials ?? "イニシャル未設定", department: author.department, isInitials: true, profileId: null };
  return { name: author.name ?? "名前未設定", department: author.department, isInitials: false, profileId: author.id };
}

export type ArticleCard = {
  id: string;
  title: string;
  excerpt: string;
  readingMinutes: number;
  category: CategoryKey | null;
  facets: FacetLabel[];
  likeCount: number;
  commentCount: number;
  /** 月間ベストに選ばれた月（いちばん新しいもの） */
  awardMonth: string | null;
  firstPublishedAt: Date | null;
  author: PublicAuthor;
  tags: { name: string; displayName: string }[];
};

export function toCard(row: CardRow): ArticleCard {
  return {
    id: row.id,
    title: row.publishedVersion?.title ?? "",
    excerpt: excerptOf(row.publishedVersion?.bodyMd ?? ""),
    readingMinutes: readingMinutes(row.publishedVersion?.bodyMd ?? ""),
    category: row.publishedVersion?.category ?? null,
    facets: describeFacets(row.publishedVersion?.category, row.publishedVersion?.facets ?? []),
    likeCount: row._count.likes,
    awardMonth: row.awards[0] ? monthOf(new Date(row.awards[0].month.getTime() + 9 * 3600_000)) : null,
    commentCount: row._count.comments,
    firstPublishedAt: row.firstPublishedAt,
    author: toPublicAuthor(row.author, row.publishedVersion?.showInitials ?? false),
    tags: row.publishedVersion?.tags.map((t) => t.tag) ?? [],
  };
}

export type Page<T> = { items: T[]; total: number; page: number; pageCount: number };

function pageOf<T>(items: T[], total: number, page: number): Page<T> {
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/**
 * 公開中の記事を新着順に返す。大分類・属性・タグ・著者の部署で絞り込める。
 * 属性は同じ軸の中は「どれか」、軸どうしは「すべて」を満たすもの。
 */
export async function listPublishedArticles(
  opts: {
    category?: CategoryKey;
    facets?: string[];
    department?: Department;
    tagName?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<Page<ArticleCard>> {
  const page = Math.max(1, opts.page ?? 1);
  const take = opts.pageSize ?? PAGE_SIZE;
  const version: Prisma.ArticleVersionWhereInput = {
    ...(opts.category && { category: opts.category }),
    ...(opts.tagName && { tags: { some: { tag: { name: normalizeTagName(opts.tagName) } } } }),
  };
  const groups = groupFilter(opts.category, opts.facets ?? []);
  if (groups.length > 0) version.AND = groups.map((g) => ({ facets: { hasSome: g } }));
  const where: Prisma.ArticleWhereInput = {
    ...visiblePublished,
    ...(opts.department && { author: { department: opts.department } }),
    ...(Object.keys(version).length > 0 && { publishedVersion: version }),
  };
  const [rows, total] = await Promise.all([
    prisma.article.findMany({
      where,
      select: cardSelect,
      orderBy: [{ firstPublishedAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * take,
      take,
    }),
    prisma.article.count({ where }),
  ]);
  return pageOf(rows.map(toCard), total, page);
}

export const MAX_SEARCH_TERMS = 5;

/** 検索語を空白で区切る。全角空白も区切りとして扱う */
export function splitSearchTerms(q: string): string[] {
  return q
    .normalize("NFKC")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t) => t.slice(0, 50))
    .slice(0, MAX_SEARCH_TERMS);
}

/**
 * 公開中の記事をタイトル・本文・タグで全文検索する（pg_bigm）。複数の語はすべてを含むもの（AND）。
 * 生 SQL はタグ付きテンプレートだけで組み立てる。
 */
export async function searchPublishedArticles(q: string, pageArg = 1): Promise<Page<ArticleCard>> {
  const page = Math.max(1, pageArg);
  const terms = splitSearchTerms(q);
  if (terms.length === 0) return pageOf([], 0, page);

  // lower() の式インデックス（pg_bigm）を使うため、ILIKE ではなく lower(...) LIKE で書く
  const conditions = terms.map((t) => {
    const lower = t.toLowerCase();
    return Prisma.sql`(
      lower(v.title) LIKE likequery(${lower})
      OR lower(v.body_md) LIKE likequery(${lower})
      OR EXISTS (
        SELECT 1 FROM version_tags vt JOIN tags tg ON tg.id = vt.tag_id
        WHERE vt.version_id = v.id AND tg.name LIKE likequery(${normalizeTagName(t)})
      )
    )`;
  });
  const where = Prisma.sql`
    FROM articles a JOIN article_versions v ON v.id = a.published_version_id
    WHERE a.hidden_at IS NULL AND ${Prisma.join(conditions, " AND ")}`;

  const [ids, [{ count }]] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id ${where}
      ORDER BY a.first_published_at DESC, a.id
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count ${where}`,
  ]);

  const rows = await prisma.article.findMany({ where: { id: { in: ids.map((r) => r.id) } }, select: cardSelect });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = ids.flatMap((r) => {
    const row = byId.get(r.id);
    return row ? [toCard(row)] : [];
  });
  return pageOf(items, Number(count), page);
}

export type TagSummary = { name: string; displayName: string; articleCount: number };

/** 公開中の記事に付いているタグを記事数の多い順に返す */
export async function listTags(limit = 200): Promise<TagSummary[]> {
  const rows = await prisma.$queryRaw<{ name: string; display_name: string; count: bigint }[]>`
    SELECT t.name, t.display_name, count(*) AS count
    FROM tags t
    JOIN version_tags vt ON vt.tag_id = t.id
    JOIN articles a ON a.published_version_id = vt.version_id
    WHERE a.hidden_at IS NULL
    GROUP BY t.id
    ORDER BY count DESC, t.name
    LIMIT ${limit}`;
  return rows.map((r) => ({ name: r.name, displayName: r.display_name, articleCount: Number(r.count) }));
}

export async function findTag(name: string) {
  return prisma.tag.findUnique({ where: { name: normalizeTagName(name) }, select: { name: true, displayName: true } });
}

const versionSelect = {
  id: true,
  versionNo: true,
  title: true,
  bodyMd: true,
  status: true,
  showInitials: true,
  category: true,
  facets: true,
  submittedAt: true,
  rejectReason: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: { name: true, displayName: true } } } },
} satisfies Prisma.ArticleVersionSelect;

type VersionRow = Prisma.ArticleVersionGetPayload<{ select: typeof versionSelect }>;

export type VersionView = Omit<VersionRow, "tags"> & { tags: { name: string; displayName: string }[] };

function toVersionView(v: VersionRow): VersionView {
  return { ...v, tags: v.tags.map((t) => t.tag) };
}

async function loadArticle(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return prisma.article.findUnique({
    where: { id },
    select: {
      id: true,
      authorId: true,
      firstPublishedAt: true,
      hiddenAt: true,
      author: { select: { id: true, name: true, initials: true, department: true } },
      publishedVersion: { select: versionSelect },
      // 最新の版。作業中（draft / 審査中 / 差し戻し）かどうかは状態で判断する
      versions: { orderBy: { versionNo: "desc" }, select: versionSelect, take: 1 },
    },
  });
}

export type ArticleDetail = {
  id: string;
  /** 表示する版（公開中の版。未公開なら著者にだけ作業中の版）に合わせた著者表示 */
  author: PublicAuthor;
  firstPublishedAt: Date | null;
  hidden: boolean;
  /** 緊急非公開の理由（著者と admin にだけ返す） */
  hiddenReason: string | null;
  isAuthor: boolean;
  /** 公開中の版（著者以外にはこれだけが見える） */
  published: VersionView | null;
  /** 作業中の版（draft / ai_review / admin_review / rejected）。著者にだけ返す */
  working: VersionView | null;
};

async function latestHiddenReason(articleId: string) {
  const log = await prisma.auditLog.findFirst({
    where: { articleId, action: "article_hidden" },
    orderBy: { id: "desc" },
    select: { reason: true },
  });
  return log?.reason ?? null;
}

/**
 * 記事詳細。見てよい記事でなければ null を返す（存在するかどうかも知らせない）。
 * - 著者以外：公開中の版だけ。緊急非公開の記事は admin だけが見られる
 * - 作業中の版は著者だけ（admin が審査中の版を見るのはレビュー画面から）
 */
export async function getArticleDetail(viewer: Viewer, id: string): Promise<ArticleDetail | null> {
  const article = await loadArticle(id);
  if (!article) return null;
  const isAuthor = article.authorId === viewer.id;
  const isAdmin = viewer.role === "admin";
  const hidden = article.hiddenAt !== null;
  const visible = isAuthor || (article.publishedVersion !== null && (!hidden || isAdmin));
  if (!visible) return null;

  const latest = article.versions[0];
  const working = isAuthor && latest && isWorkingStatus(latest.status) ? latest : null;
  const shown = article.publishedVersion ?? working;
  return {
    id: article.id,
    author: toPublicAuthor(article.author, shown?.showInitials ?? false),
    firstPublishedAt: article.firstPublishedAt,
    hidden,
    hiddenReason: hidden ? await latestHiddenReason(article.id) : null,
    isAuthor,
    published: article.publishedVersion ? toVersionView(article.publishedVersion) : null,
    working: working ? toVersionView(working) : null,
  };
}

/** 編集画面用。著者以外には null（admin でも他人の記事は編集できない） */
export async function getArticleForEdit(viewer: Viewer, id: string) {
  const detail = await getArticleDetail(viewer, id);
  return detail?.isAuthor ? detail : null;
}

export const MY_ARTICLE_TABS = ["draft", "review", "rejected", "published"] as const;
export type MyArticleTab = (typeof MY_ARTICLE_TABS)[number];

export type MyArticleRow = {
  id: string;
  title: string;
  updatedAt: Date;
  working: { status: VersionStatus; versionNo: number; updatedAt: Date; rejectReason: string | null } | null;
  published: boolean;
  hidden: boolean;
};

function tabOf(row: MyArticleRow): MyArticleTab | null {
  switch (row.working?.status) {
    case "draft":
      return "draft";
    case "ai_review":
    case "admin_review":
      return "review";
    case "rejected":
      return "rejected";
    default:
      return null;
  }
}

/** 自分の記事を状態のタブごとに返す。タブごとの件数も返す（作業中の版の状態は最新の版で決まる） */
export async function listMyArticles(viewer: Viewer, tab: MyArticleTab) {
  const rows = await prisma.article.findMany({
    where: { authorId: viewer.id },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true,
      updatedAt: true,
      hiddenAt: true,
      publishedVersion: { select: { title: true } },
      versions: {
        orderBy: { versionNo: "desc" },
        select: { status: true, versionNo: true, title: true, updatedAt: true, rejectReason: true },
        take: 1,
      },
    },
  });

  const all: MyArticleRow[] = rows.map((r) => {
    const latest = r.versions[0];
    const w = latest && isWorkingStatus(latest.status) ? latest : null;
    return {
      id: r.id,
      title: w?.title || r.publishedVersion?.title || "",
      updatedAt: w?.updatedAt ?? r.updatedAt,
      working: w ? { status: w.status, versionNo: w.versionNo, updatedAt: w.updatedAt, rejectReason: w.rejectReason } : null,
      published: r.publishedVersion !== null,
      hidden: r.hiddenAt !== null,
    };
  });

  const inTab = (row: MyArticleRow, t: MyArticleTab) => (t === "published" ? row.published : tabOf(row) === t);
  const countByTab = Object.fromEntries(MY_ARTICLE_TABS.map((t) => [t, all.filter((r) => inTab(r, t)).length])) as Record<
    MyArticleTab,
    number
  >;
  return { items: all.filter((r) => inTab(r, tab)), countByTab };
}

/** 大分類ごとの公開記事数（トップの「分類から探す」用） */
export async function countByCategory(): Promise<Record<CategoryKey, number>> {
  const rows = await prisma.$queryRaw<{ category: ArticleCategory; count: bigint }[]>`
    SELECT v.category, count(*) AS count
    FROM articles a JOIN article_versions v ON v.id = a.published_version_id
    WHERE a.hidden_at IS NULL AND v.category IS NOT NULL
    GROUP BY v.category`;
  const out = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])) as Record<CategoryKey, number>;
  for (const r of rows) out[r.category] = Number(r.count);
  return out;
}

/** 大分類の中で、属性ごとの公開記事数（絞り込みの選択肢に件数を出すため） */
export async function countFacets(category: CategoryKey): Promise<Record<string, number>> {
  const rows = await prisma.$queryRaw<{ facet: string; count: bigint }[]>`
    SELECT f AS facet, count(*) AS count
    FROM articles a
    JOIN article_versions v ON v.id = a.published_version_id
    CROSS JOIN LATERAL unnest(v.facets) AS f
    WHERE a.hidden_at IS NULL AND v.category = ${category}::"ArticleCategory"
    GROUP BY f`;
  return Object.fromEntries(rows.map((r) => [r.facet, Number(r.count)]));
}
