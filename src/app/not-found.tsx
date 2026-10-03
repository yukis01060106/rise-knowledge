import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-bold">ページが見つかりません</h1>
      <p className="text-sm text-muted">削除されたか、表示する権限がない可能性があります。</p>
      <Link href="/" className="text-brand underline">
        トップへ戻る
      </Link>
    </main>
  );
}
