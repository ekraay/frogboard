-- CreateIndex
CREATE INDEX "Task_eventId_position_idx" ON "Task"("eventId", "position");

-- Safety net: the previous migration runs non-transactionally (enum ADD VALUE),
-- so re-apply its backfill idempotently. No-op when it succeeded.
UPDATE "Event" SET "status" = 'published' WHERE "status" = 'draft';

UPDATE "Task" t SET "position" = sub.rn * 1024
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "eventId"
    ORDER BY "date" ASC NULLS LAST, "startAt" ASC NULLS LAST, "title" ASC
  ) AS rn
  FROM "Task"
) sub
WHERE t.id = sub.id AND t."position" = 0;
