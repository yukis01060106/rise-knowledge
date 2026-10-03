"use client";

import { useActionState } from "react";
import { updateMySettings } from "@/server/users/actions";
import { buttonClass } from "@/components/ui/button";
import { DEPARTMENT_LABELS } from "@/lib/labels";
import type { Department } from "@/generated/prisma/enums";

export function SettingsForm({ department, initials }: { department: Department; initials: string | null }) {
  const [state, action, pending] = useActionState(updateMySettings, null);

  return (
    <form action={action} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-bold">所属部署</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface p-3 has-checked:border-brand has-checked:bg-brand-soft"
            >
              <input type="radio" name="department" value={value} defaultChecked={value === department} required />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="initials" className="block text-sm font-bold">
          イニシャル
        </label>
        <p className="text-sm text-muted">
          記事を「イニシャル表示」で投稿すると、ほかの人には名前の代わりにこのイニシャルが表示されます。
          アルファベットで入力してください（例：kt → K.T.）。
        </p>
        <input
          id="initials"
          name="initials"
          defaultValue={initials ?? ""}
          maxLength={20}
          placeholder="K.T."
          className="w-40 rounded-md border border-border bg-surface px-3 py-2 font-mono focus:border-brand focus:outline-none"
        />
        <p className="text-xs text-muted">
          ※ 管理者のレビュー画面と監査ログには実名が表示されます。社内の人に完全に匿名になるわけではありません。
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass()}>
          {pending ? "保存中…" : "保存する"}
        </button>
        {state && (
          <p role="status" className={`text-sm ${state.ok ? "text-emerald-700" : "text-danger"}`}>
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
