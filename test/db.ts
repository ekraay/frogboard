import { prisma } from "@/lib/db";

/**
 * Wipes all rows. Refuses to run unless DATABASE_URL clearly points at a test
 * database, so production/dev data can never be destroyed by a stray test run.
 */
export async function resetDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(url)) {
    throw new Error(
      `resetDb() refused: DATABASE_URL does not look like a test database (${url || "unset"}).`,
    );
  }
  await prisma.auditLog.deleteMany();
  await prisma.signup.deleteMany();
  await prisma.rsvp.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.person.deleteMany();
  await prisma.task.deleteMany();
  await prisma.event.deleteMany();
}
