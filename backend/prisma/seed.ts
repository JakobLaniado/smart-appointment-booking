import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // Create sample provider user
  const providerPassword = await bcrypt.hash("provider123", 10);
  const providerUser = await prisma.user.upsert({
    where: { email: "dr.smith@example.com" },
    update: {},
    create: {
      email: "dr.smith@example.com",
      password: providerPassword,
      name: "Dr. Sarah Smith",
      role: UserRole.PROVIDER,
    },
  });

  // Create provider profile
  const provider = await prisma.provider.upsert({
    where: { userId: providerUser.id },
    update: {},
    create: {
      userId: providerUser.id,
      profession: "General Dentist",
      timezone: "America/New_York",
      bufferMinutes: 15,
    },
  });

  // Create Mon-Fri 9:00-17:00 recurring availability
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
    const existing = await prisma.recurringAvailability.findFirst({
      where: { providerId: provider.id, dayOfWeek },
    });
    if (!existing) {
      await prisma.recurringAvailability.create({
        data: {
          providerId: provider.id,
          dayOfWeek,
          startTime: "09:00",
          endTime: "17:00",
        },
      });
    }
  }

  // Create sample customer user
  const customerPassword = await bcrypt.hash("customer123", 10);
  await prisma.user.upsert({
    where: { email: "john.doe@example.com" },
    update: {},
    create: {
      email: "john.doe@example.com",
      password: customerPassword,
      name: "John Doe",
      role: UserRole.CUSTOMER,
    },
  });

  console.log("Seed complete:");
  console.log("  Provider: dr.smith@example.com / provider123");
  console.log("  Customer: john.doe@example.com / customer123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
