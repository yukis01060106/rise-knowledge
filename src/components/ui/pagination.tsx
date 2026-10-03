import Link from "next/link";

type Props = {
  page: number;
  pageCount: number;
  /** ページ番号以外のクエリ（検索語・絞り込み） */
  basePath: string;
  params?: Record<string, string | undefined>;
};

function hrefFor(basePath: string, params: Props["params"], page: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({ page, pageCount, basePath, params }: Props) {
  if (pageCount <= 1) return null;
  const link = "rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-background";
  return (
    <nav aria-label="ページ送り" className="mt-6 flex items-center justify-center gap-3">
      {page > 1 ? (
        <Link href={hrefFor(basePath, params, page - 1)} className={link}>
          ← 前へ
        </Link>
      ) : (
        <span className={`${link} opacity-40`}>← 前へ</span>
      )}
      <span className="text-sm text-muted">
        {page} / {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={hrefFor(basePath, params, page + 1)} className={link}>
          次へ →
        </Link>
      ) : (
        <span className={`${link} opacity-40`}>次へ →</span>
      )}
    </nav>
  );
}

/** searchParams の page を 1 以上の整数にする */
export function parsePage(value: string | string[] | undefined) {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}
