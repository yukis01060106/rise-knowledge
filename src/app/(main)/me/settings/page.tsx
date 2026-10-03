import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const user = await requireUser();
  if (!user.department) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="設定" description={`${user.name ?? user.email}（${user.email}）`} />
      <div className="rounded-xl border border-border bg-surface p-6">
        <SettingsForm department={user.department} initials={user.initials} />
      </div>
    </div>
  );
}
