-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_taskId_fkey";

-- AlterTable
ALTER TABLE "AuditLog" ALTER COLUMN "taskId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
