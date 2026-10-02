"use server";

import { signIn, signOut } from "./config";
import { getEnv } from "@/server/env";
import { safeCallbackPath } from "@/lib/safe-redirect";

export async function loginAction(formData: FormData) {
  await signIn(getEnv().AUTH_PROVIDER, { redirectTo: safeCallbackPath(formData.get("callbackUrl")) });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
