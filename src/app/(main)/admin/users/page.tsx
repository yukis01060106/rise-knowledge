import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db";
import { DEPARTMENT_LABELS } from "@/lib/labels";
import { UserRowActions } from "./user-row-actions";

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
    select: { id: true, name: true, email: true, department: true, role: true, disabledAt: true, lastLoginAt: true },
  });

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">ユーザー管理</h1>
      <p className="text-sm text-gray-600">
        ロールの変更と無効化は監査ログに記録されます。自分自身のロールは変更できません。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">名前</th>
              <th className="p-2">メール</th>
              <th className="p-2">所属</th>
              <th className="p-2">最終ログイン</th>
              <th className="p-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-b ${u.disabledAt ? "text-gray-400" : ""}`}>
                <td className="p-2">{u.name ?? "-"}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2">{u.department ? DEPARTMENT_LABELS[u.department] : "未設定"}</td>
                <td className="p-2">
                  {u.lastLoginAt?.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) ?? "-"}
                </td>
                <td className="p-2">
                  <UserRowActions
                    userId={u.id}
                    role={u.role}
                    disabled={Boolean(u.disabledAt)}
                    isSelf={u.id === me.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
