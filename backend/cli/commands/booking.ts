import { input, select } from "@inquirer/prompts";
import chalk from "chalk";
import Table from "cli-table3";
import type { ApiClient } from "../api-client.js";

export async function bookingMenu(api: ApiClient) {
  let running = true;
  while (running) {
    const action = await select({
      message: "Booking actions:",
      choices: [
        { name: "Browse providers & book", value: "book" },
        { name: "View my bookings", value: "list" },
        { name: "Cancel a booking", value: "cancel" },
        { name: "Back to main menu", value: "back" },
      ],
    });

    switch (action) {
      case "book":
        await bookFlow(api);
        break;
      case "list":
        await listBookings(api);
        break;
      case "cancel":
        await cancelBooking(api);
        break;
      case "back":
        running = false;
        break;
    }
  }
}

async function bookFlow(api: ApiClient) {
  // 1. List providers
  const providers = (await api.listProviders()) as unknown as Array<{
    id: string;
    name: string;
    profession: string;
    timezone: string;
  }>;

  if (!Array.isArray(providers) || providers.length === 0) {
    console.log(chalk.yellow("No providers available."));
    return;
  }

  const providerId = await select({
    message: "Select a provider:",
    choices: providers.map((p) => ({
      name: `${p.name} (${p.profession}) - ${p.timezone}`,
      value: p.id,
    })),
  });

  // 2. Query slots
  const startDate = await input({
    message: "Start date (YYYY-MM-DD):",
    default: new Date().toISOString().split("T")[0],
  });
  const endDate = await input({
    message: "End date (YYYY-MM-DD):",
    default: new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .split("T")[0],
  });
  const duration = await input({
    message: "Duration (minutes):",
    default: "30",
  });

  const slots = (await api.querySlots(providerId, {
    startDate,
    endDate,
    durationMinutes: parseInt(duration, 10),
  })) as unknown as Array<{
    startTime: string;
    endTime: string;
    score: number;
  }>;

  if (!Array.isArray(slots) || slots.length === 0) {
    console.log(chalk.yellow("No available slots found."));
    return;
  }

  // 3. Select a slot
  const slotIdx = await select({
    message: "Select a slot:",
    choices: slots.map((s, i) => ({
      name: `${new Date(s.startTime).toLocaleString()} - ${new Date(s.endTime).toLocaleString()} (score: ${s.score})`,
      value: i,
    })),
  });

  const slot = slots[slotIdx]!;
  const notes = await input({ message: "Notes (optional):" });

  // 4. Hold
  console.log(chalk.cyan("Holding slot..."));
  const hold = (await api.holdSlot({
    providerId,
    startTime: slot.startTime,
    durationMinutes: parseInt(duration, 10),
    notes: notes || undefined,
  })) as { holdId: string; expiresAt: string };

  console.log(
    chalk.green(
      `Hold created! ID: ${hold.holdId} (expires ${new Date(hold.expiresAt).toLocaleString()})`,
    ),
  );

  // 5. Confirm
  const confirmChoice = await select({
    message: "Confirm this booking?",
    choices: [
      { name: "Yes, confirm", value: "yes" },
      { name: "No, let it expire", value: "no" },
    ],
  });

  if (confirmChoice === "yes") {
    const booking = await api.confirmBooking(hold.holdId);
    console.log(chalk.green("\nBooking confirmed!"));
    console.log(booking);
  } else {
    console.log(chalk.yellow("Booking not confirmed. Hold will expire."));
  }
}

async function listBookings(api: ApiClient) {
  const bookings = (await api.listBookings()) as unknown as {
    bookings: Array<{
      id: string;
      providerName: string;
      startTime: string;
      endTime: string;
      status: string;
      notes?: string;
    }>;
    pagination: { total: number; page: number; totalPages: number };
  };

  if (!bookings.bookings?.length) {
    console.log(chalk.yellow("No bookings found."));
    return;
  }

  const table = new Table({
    head: ["ID", "Provider", "Start", "End", "Status", "Notes"],
  });
  for (const b of bookings.bookings) {
    table.push([
      b.id.slice(0, 8),
      b.providerName,
      new Date(b.startTime).toLocaleString(),
      new Date(b.endTime).toLocaleString(),
      b.status,
      b.notes ?? "-",
    ]);
  }
  console.log(table.toString());
  console.log(
    chalk.dim(
      `Page ${bookings.pagination.page}/${bookings.pagination.totalPages} (${bookings.pagination.total} total)`,
    ),
  );
}

async function cancelBooking(api: ApiClient) {
  const bookingId = await input({ message: "Booking ID to cancel:" });
  const reason = await input({ message: "Reason (optional):" });

  const result = await api.cancelBooking(
    bookingId,
    reason || undefined,
  );
  console.log(chalk.green("Booking cancelled!"));
  console.log(result);
}
