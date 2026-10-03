import { requireAdmin } from "@/server/auth/guards";

// 管理画面の共通レイアウト（メニューは左のサイドバー）。各ページでも requireAdmin を呼ぶこと
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div>
      <p className="mb-3 inline-block rounded bg-foreground px-2 py-0.5 text-xs font-bold text-white">管理</p>
      {children}
    </div>
  );
}
