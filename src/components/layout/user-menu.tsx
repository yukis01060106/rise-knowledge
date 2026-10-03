import Link from "next/link";
import type { Department, Role } from "@/generated/prisma/enums";
import { logoutAction } from "@/server/auth/actions";
import { Avatar } from "@/components/ui/avatar";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/labels";

type Props = { name: string | null; email: string; department: Department; role: Role };

/** ヘッダー右上のメニュー（JS なしで開閉できるよう details を使う） */
export function UserMenu({ name, email, department, role }: Props) {
  const item = "block rounded px-3 py-2 text-sm hover:bg-background";
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-1.5 py-1 hover:bg-background [&::-webkit-details-marker]:hidden">
        <Avatar name={name} department={department} />
        <span className="sr-only">メニューを開く</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-60 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
        <div className="border-b border-border px-3 py-2">
          <p className="truncate font-semibold">{name ?? email}</p>
          <p className="text-xs text-muted">
            {DEPARTMENT_LABELS[department]}・{ROLE_LABELS[role]}
          </p>
        </div>
        <Link href="/me/articles" className={item}>
          自分の記事
        </Link>
        {role === "admin" && (
          <Link href="/admin/users" className={item}>
            ユーザー管理
          </Link>
        )}
        <form action={logoutAction} className="border-t border-border pt-1">
          <button type="submit" className={`${item} w-full text-left text-muted`}>
            ログアウト
          </button>
        </form>
      </div>
    </details>
  );
}
