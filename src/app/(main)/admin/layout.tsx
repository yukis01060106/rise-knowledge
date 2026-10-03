import { requireAdmin } from "@/server/auth/guards";
import { countPendingReviews } from "@/server/articles/admin-queries";
import { AdminNav } from "./admin-nav";

// 管理画面の共通レイアウト。各ページでも requireAdmin を呼ぶこと
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const pending = await countPendingReviews(admin);
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="rounded bg-foreground px-2 py-0.5 text-xs font-bold text-white">管理</span>
        <AdminNav pending={pending} />
      </div>
      {children}
    </div>
  );
}
