-- Prisma v6 cannot model a partial unique index in schema.prisma, so it lives here.
-- Enforce exactly one whole-event (day IS NULL) Rsvp row per (person, event).
CREATE UNIQUE INDEX "Rsvp_personId_eventId_wholeEvent_key"
  ON "Rsvp" ("personId", "eventId")
  WHERE "day" IS NULL;
