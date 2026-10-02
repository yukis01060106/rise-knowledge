import { requireUser } from "@/server/auth/guards";

export default async function HomePage() {
  const user = await requireUser();

  return (
    <section className="space-y-2">
      <h1 className="text-xl font-bold">ようこそ、{user.name ?? user.email} さん</h1>
      <p className="text-gray-600">学びを、仲間の武器にする！ 記事の投稿・閲覧はフェーズ2で追加します。</p>
    </section>
  );
}
