import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Department, VersionStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db";
import { normalizeTagName } from "@/lib/tags";
import { WORKING_STATUSES } from "@/lib/labels";

/**
 * 記事の取得はかならずこのモジュールを通す（誰が・どの版を見てよいかをここで判定する）。
 * - 公開中の版：ログインしている全員（緊急非公開の記事は除く）
 * - 作業中の版（draft / ai_review / admin_review / rejected）：著者だけ
 */

export const PAGE_SIZE = 20;

type Viewer = { id: string };

/** 一覧に出してよい記事（公開中かつ非公開化されていない） */
const visiblePublished = {
  publishedVersionId: { not: null },
  hiddenAt: null,
} satisfies Prisma.ArticleWhereInput;

const cardSelect = {
  id: true,
  firstPublishedAt: true,
  author: { select: { id: true, name: true, department: true } },
  publishedVersion: {
    select: {
      title: true,
      tags: { select: { tag: { select: { name: true, displayName: true } } } },
    },
  },
} satisfies Prisma.ArticleSelect;

type CardRow = Prisma.ArticleGetPayload<{ select: typeof cardSelect }>;

export type ArticleCard = {
  id: string;
  title: string;
  firstPublishedAt: Date | null;
  author: { id: string; name: string | null; department: Department | null };
  tags: { name: string; displayName: string }[];
};

function toCard(row: CardRow): ArticleCard {
  return {
    id: row.id,
    title: row.publishedVersion?.title ?? "",
    firstPublishedAt: row.firstPublishedAt,
    author: row.author,
    tags: row.publishedVersion?.tags.map((t) => t.tag) ?? [],
  };
}

export type Page<T> = { items: T[]; total: number; page: number; pageCount: number };

function pageOf<T>(items: T[], total: number, page: number): Page<T> {
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** 公開中の記事を新着順に返す。部署・タグで絞り込める */
export async function listPublishedArticles(
  opts: { department?: Department; tagName?: string; page?: number; pageSize?: number } = {},
): Promise<Page<ArticleCard>> {
  const page = Math.max(1, opts.page ?? 1);
  const take = opts.pageSize ?? PAGE_SIZE;
  const where: Prisma.ArticleWhereInput = {
    ...visiblePublished,
    ...(opts.department && { author: { department: opts.department } }),
    ...(opts.tagName && {
      publishedVersion: { tags: { some: { tag: { name: normalizeTagName(opts.tagName) } } } },
    }),
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
      author: { select: { id: true, name: true, department: true } },
      publishedVersion: { select: versionSelect },
      versions: {
        where: { status: { in: [...WORKING_STATUSES] } },
        select: versionSelect,
        take: 1,
      },
    },
  });
}

export type ArticleDetail = {
  id: string;
  author: { id: string; name: string | null; department: Department | null };
  firstPublishedAt: Date | null;
  hidden: boolean;
  isAuthor: boolean;
  /** 公開中の版（著者以外にはこれだけが見える） */
  published: VersionView | null;
  /** 作業中の版。著者にだけ返す */
  working: VersionView | null;
};

/**
 * 記事詳細。見てよい記事でなければ null を返す（存在するかどうかも知らせない）。
 * 著者以外：公開中かつ非公開化されていない記事の公開中の版だけ。
 */
export async function getArticleDetail(viewer: Viewer, id: string): Promise<ArticleDetail | null> {
  const article = await loadArticle(id);
  if (!article) return null;
  const isAuthor = article.authorId === viewer.id;
  const visibleToOthers = article.publishedVersion !== null && article.hiddenAt === null;
  if (!isAuthor && !visibleToOthers) return null;

  return {
    id: article.id,
    author: article.author,
    firstPublishedAt: article.firstPublishedAt,
    hidden: article.hiddenAt !== null,
    isAuthor,
    published: article.publishedVersion ? toVersionView(article.publishedVersion) : null,
    working: isAuthor && article.versions[0] ? toVersionView(article.versions[0]) : null,
  };
}

/** 編集画面用。著者以外には null（admin でも他人の記事は編集できない） */
export async function getArticleForEdit(viewer: Viewer, id: string) {
  const detail = await getArticleDetail(viewer, id);
  return detail?.isAuthor ? detail : null;
}

export const MY_ARTICLE_TABS = ["draft", "review", "rejected", "published"] as const;
export type MyArticleTab = (typeof MY_ARTICLE_TABS)[number];

const TAB_STATUSES: Record<Exclude<MyArticleTab, "published">, VersionStatus[]> = {
  draft: ["draft"],
  review: ["ai_review", "admin_review"],
  rejected: ["rejected"],
};

export type MyArticleRow = {
  id: string;
  title: string;
  updatedAt: Date;
  working: { status: VersionStatus; versionNo: number; updatedAt: Date } | null;
  published: boolean;
  hidden: boolean;
};

/** 自分の記事を状態のタブごとに返す。タブごとの件数も返す */
export async function listMyArticles(viewer: Viewer, tab: MyArticleTab) {
  const whereFor = (t: MyArticleTab): Prisma.ArticleWhereInput =>
    t === "published"
      ? { authorId: viewer.id, publishedVersionId: { not: null } }
      : { authorId: viewer.id, versions: { some: { status: { in: TAB_STATUSES[t] } } } };

  const [rows, ...counts] = await Promise.all([
    prisma.article.findMany({
      where: whereFor(tab),
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        updatedAt: true,
        hiddenAt: true,
        publishedVersion: { select: { title: true } },
        versions: {
          where: { status: { in: [...WORKING_STATUSES] } },
          select: { status: true, versionNo: true, title: true, updatedAt: true },
          take: 1,
        },
      },
    }),
    ...MY_ARTICLE_TABS.map((t) => prisma.article.count({ where: whereFor(t) })),
  ]);

  const items: MyArticleRow[] = rows.map((r) => {
    const w = r.versions[0];
    return {
      id: r.id,
      title: w?.title || r.publishedVersion?.title || "",
      updatedAt: w?.updatedAt ?? r.updatedAt,
      working: w ? { status: w.status, versionNo: w.versionNo, updatedAt: w.updatedAt } : null,
      published: r.publishedVersion !== null,
      hidden: r.hiddenAt !== null,
    };
  });
  const countByTab = Object.fromEntries(MY_ARTICLE_TABS.map((t, i) => [t, counts[i]])) as Record<MyArticleTab, number>;
  return { items, countByTab };
}
