-- DropForeignKey
ALTER TABLE "compliance_checks" DROP CONSTRAINT "compliance_checks_version_id_fkey";

-- AddForeignKey
ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "article_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
