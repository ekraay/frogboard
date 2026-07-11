-- Prisma v6 cannot model a partial unique index in schema.prisma, so it lives here.
-- Enforce exactly one per-day (day IS NOT NULL) Rsvp row per (person, event, day).
CREATE UNIQUE INDEX "Rsvp_personId_eventId_day_key"
  ON "Rsvp" ("personId", "eventId", "day")
  WHERE "day" IS NOT NULL;
