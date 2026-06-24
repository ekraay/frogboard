import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.signup.deleteMany();
  await prisma.task.deleteMany();
  await prisma.event.deleteMany();

  const event = await prisma.event.create({
    data: {
      name: "Ginza Bazaar / Bon Odori 2026",
      slug: "ginza-2026",
      startDate: new Date("2026-07-25T00:00:00Z"),
      endDate: new Date("2026-07-26T00:00:00Z"),
      status: "published",
    },
  });

  // PDT is UTC-7: 10:00 AM PDT = 17:00Z, 1:00 PM PDT = 20:00Z, etc.
  await prisma.task.createMany({
    data: [
      {
        eventId: event.id, kind: "shift", title: "Games", category: "Games",
        requestedGroup: "Scouts", neededCount: 5,
        date: new Date("2026-07-25T00:00:00Z"),
        startAt: new Date("2026-07-25T17:00:00Z"), endAt: new Date("2026-07-25T20:00:00Z"),
        location: "Inside Gym", pointOfContact: "Yumi 415-370-1477",
        definitionOfDone: "Booth staffed and tidy at handover.",
        position: 1024,
      },
      {
        eventId: event.id, kind: "shift", title: "Bingo", category: "Bingo",
        neededCount: 3, date: new Date("2026-07-25T00:00:00Z"),
        startAt: new Date("2026-07-25T20:00:00Z"), endAt: new Date("2026-07-25T23:00:00Z"),
        location: "Inside Gym",
        position: 2048,
      },
      {
        eventId: event.id, kind: "shift", title: "Food Service", category: "Food/Kitchen",
        requestedGroup: "Scouts", neededCount: 3,
        date: new Date("2026-07-25T00:00:00Z"),
        // all-day: date set, no startAt/endAt
        position: 3072,
      },
      {
        eventId: event.id, kind: "frog", title: "Bring 50 paper cups",
        category: "Supplies", neededCount: 1,
        dueBy: new Date("2026-07-25T17:00:00Z"),
        definitionOfDone: "Cups delivered to the dining area.",
        position: 4096,
      },
    ],
  });

  console.log(`Seeded event ${event.id} with 4 tasks.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
