-- AlterTable
ALTER TABLE "Event" ADD COLUMN "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
