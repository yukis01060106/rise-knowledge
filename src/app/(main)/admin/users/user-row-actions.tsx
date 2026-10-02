"use client";

import { useActionState } from "react";
import { changeUserRole, setUserDisabled } from "@/server/users/actions";
import { ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/generated/prisma/enums";

type Props = { userId: string; role: Role; disabled: boolean; isSelf: boolean };

export function UserRowActions({ userId, role, disabled, isSelf }: Props) {
  const [roleState, roleAction, rolePending] = useActionState(changeUserRole, null);
  const [disableState, disableAction, disablePending] = useActionState(setUserDisabled, null);
  const message = disableState ?? roleState;

  if (isSelf) return <span>{ROLE_LABELS[role]}（自分）</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={roleAction} className="flex items-center gap-1">
        <input type="hidden" name="userId" value={userId} />
        <select name="role" defaultValue={role} disabled={disabled} className="rounded border px-1 py-0.5">
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={rolePending || disabled} className="rounded border px-2 py-0.5 disabled:opacity-50">
          変更
        </button>
      </form>
      <form
        action={disableAction}
        onSubmit={(e) => {
          if (!disabled && !confirm("このユーザーを無効化しますか？ログイン中のセッションも切断されます。")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="disabled" value={disabled ? "false" : "true"} />
        <button type="submit" disabled={disablePending} className="rounded border px-2 py-0.5 text-red-700 disabled:opacity-50">
          {disabled ? "有効化" : "無効化"}
        </button>
      </form>
      {message && (
        <span role="status" className={message.ok ? "text-emerald-700" : "text-red-700"}>
          {message.message}
        </span>
      )}
    </div>
  );
}
