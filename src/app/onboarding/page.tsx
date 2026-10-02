import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { DepartmentForm } from "./department-form";

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.department) redirect("/");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div>
        <h1 className="text-xl font-bold">ようこそ、{user.name ?? user.email} さん</h1>
        <p className="mt-2 text-sm text-gray-600">所属部署を選んでください。記事の部署別表示に使います。</p>
      </div>
      <DepartmentForm />
    </main>
  );
}
