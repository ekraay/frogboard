-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'published');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'create';
ALTER TYPE "AuditAction" ADD VALUE 'delete';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "status" "EventStatus" NOT NULL DEFAULT 'draft';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "description" TEXT,
ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: the live Phase 1 event stays visible on the public board.
UPDATE "Event" SET "status" = 'published';

-- Backfill: positions follow the board's previous chronological order.
UPDATE "Task" t SET "position" = sub.rn * 1024
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "eventId"
    ORDER BY "date" ASC NULLS LAST, "startAt" ASC NULLS LAST, "title" ASC
  ) AS rn
  FROM "Task"
) sub
WHERE t.id = sub.id;
