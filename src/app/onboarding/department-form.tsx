"use client";

import { useActionState } from "react";
import { updateMyDepartment } from "@/server/users/actions";
import { DEPARTMENT_LABELS } from "@/lib/labels";

export function DepartmentForm() {
  const [state, action, pending] = useActionState(updateMyDepartment, null);

  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="sr-only">所属部署</legend>
        {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 rounded border bg-white p-3">
            <input type="radio" name="department" value={value} required />
            {label}
          </label>
        ))}
      </fieldset>
      {state && !state.ok && <p role="alert" className="text-sm text-red-700">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
      >
        はじめる
      </button>
    </form>
  );
}
