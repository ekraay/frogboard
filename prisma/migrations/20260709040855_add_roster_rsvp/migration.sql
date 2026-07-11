-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('yes', 'no', 'maybe');

-- CreateTable
CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- Seed the founding org
INSERT INTO "Organization" ("id", "name", "slug") VALUES ('org_bcsf', 'BCSF', 'bcsf');

-- Add Event.orgId nullable first so existing rows don't violate NOT NULL
ALTER TABLE "Event" ADD COLUMN "orgId" TEXT;
UPDATE "Event" SET "orgId" = 'org_bcsf' WHERE "orgId" IS NULL;
ALTER TABLE "Event" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Event" ADD CONSTRAINT "Event_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Replace per-event slug uniqueness with per-org slug uniqueness
DROP INDEX IF EXISTS "Event_slug_key";
CREATE UNIQUE INDEX "Event_orgId_slug_key" ON "Event"("orgId", "slug");

-- CreateTable
CREATE TABLE "Person" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "externalIdHash" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "group" TEXT,
  "subGroup" TEXT,
  "position" TEXT,
  "minor" BOOLEAN,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Person_orgId_externalIdHash_key" ON "Person"("orgId", "externalIdHash");
CREATE INDEX "Person_orgId_group_subGroup_idx" ON "Person"("orgId", "group", "subGroup");
ALTER TABLE "Person" ADD CONSTRAINT "Person_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Rsvp" (
  "id" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "day" TIMESTAMP(3),
  "status" "RsvpStatus" NOT NULL,
  "reason" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rsvp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Rsvp_eventId_personId_idx" ON "Rsvp"("eventId", "personId");
ALTER TABLE "Rsvp" ADD CONSTRAINT "Rsvp_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Rsvp" ADD CONSTRAINT "Rsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "group" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Lead_token_key" ON "Lead"("token");
CREATE INDEX "Lead_eventId_group_idx" ON "Lead"("eventId", "group");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
