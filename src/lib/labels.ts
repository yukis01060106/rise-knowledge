import type { Department, Role } from "@/generated/prisma/enums";

export const DEPARTMENT_LABELS: Record<Department, string> = {
  dev: "開発部",
  infra: "インフラ部",
};

export const ROLE_LABELS: Record<Role, string> = {
  member: "メンバー",
  admin: "管理者",
};
