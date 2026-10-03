-- CreateEnum
CREATE TYPE "ComplianceTarget" AS ENUM ('article_version', 'comment');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('pending', 'blocked_by_prescan', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('high', 'medium', 'low');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'prescan_blocked';

-- CreateTable
CREATE TABLE "compliance_checks" (
    "id" UUID NOT NULL,
    "target_type" "ComplianceTarget" NOT NULL,
    "version_id" UUID,
    "comment_id" UUID,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'pending',
    "prescan_findings" JSONB,
    "model" TEXT,
    "prompt_version" TEXT,
    "risk_level" "RiskLevel",
    "summary" TEXT,
    "findings" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "compliance_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_checks_version_id_created_at_idx" ON "compliance_checks"("version_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "compliance_checks_comment_id_idx" ON "compliance_checks"("comment_id");

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "article_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
