import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-bold">このページを表示する権限がありません</h1>
      <Link href="/" className="text-emerald-700 underline">
        トップへ戻る
      </Link>
    </main>
  );
}
