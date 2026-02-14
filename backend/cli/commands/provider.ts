import { input, select } from "@inquirer/prompts";
import chalk from "chalk";
import Table from "cli-table3";
import type { ApiClient } from "../api-client.js";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export async function providerMenu(api: ApiClient) {
  let running = true;
  while (running) {
    const action = await select({
      message: "Provider actions:",
      choices: [
        { name: "View recurring availability", value: "list_recurring" },
        { name: "Add recurring availability", value: "add_recurring" },
        { name: "View overrides", value: "list_overrides" },
        { name: "Add override (block/open)", value: "add_override" },
        { name: "Back to main menu", value: "back" },
      ],
    });

    switch (action) {
      case "list_recurring":
        await listRecurring(api);
        break;
      case "add_recurring":
        await addRecurring(api);
        break;
      case "list_overrides":
        await listOverrides(api);
        break;
      case "add_override":
        await addOverride(api);
        break;
      case "back":
        running = false;
        break;
    }
  }
}

async function listRecurring(api: ApiClient) {
  const rules = (await api.listRecurring()) as unknown as Array<{
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>;

  if (!Array.isArray(rules) || rules.length === 0) {
    console.log(chalk.yellow("No recurring availability rules."));
    return;
  }

  const table = new Table({
    head: ["ID", "Day", "Start", "End"],
  });
  for (const r of rules) {
    table.push([
      r.id.slice(0, 8),
      DAY_NAMES[r.dayOfWeek] ?? r.dayOfWeek,
      r.startTime,
      r.endTime,
    ]);
  }
  console.log(table.toString());
}

async function addRecurring(api: ApiClient) {
  const day = await select({
    message: "Day of week:",
    choices: DAY_NAMES.map((name, i) => ({ name, value: i })),
  });
  const startTime = await input({
    message: "Start time (HH:mm):",
    default: "09:00",
  });
  const endTime = await input({
    message: "End time (HH:mm):",
    default: "17:00",
  });

  await api.addRecurring({ dayOfWeek: day, startTime, endTime });
  console.log(chalk.green("Recurring availability added!"));
}

async function listOverrides(api: ApiClient) {
  const overrides = (await api.listOverrides()) as unknown as Array<{
    id: string;
    type: string;
    startTime: string;
    endTime: string;
    reason?: string;
  }>;

  if (!Array.isArray(overrides) || overrides.length === 0) {
    console.log(chalk.yellow("No overrides."));
    return;
  }

  const table = new Table({
    head: ["ID", "Type", "Start", "End", "Reason"],
  });
  for (const o of overrides) {
    table.push([
      o.id.slice(0, 8),
      o.type,
      new Date(o.startTime).toLocaleString(),
      new Date(o.endTime).toLocaleString(),
      o.reason ?? "-",
    ]);
  }
  console.log(table.toString());
}

async function addOverride(api: ApiClient) {
  const type = await select({
    message: "Override type:",
    choices: [
      { name: "Block (no bookings)", value: "BLOCK" },
      { name: "Open (extra availability)", value: "OPEN" },
    ],
  });
  const startTime = await input({
    message: "Start time (ISO 8601):",
  });
  const endTime = await input({ message: "End time (ISO 8601):" });
  const reason = await input({ message: "Reason (optional):" });

  await api.addOverride({
    startTime,
    endTime,
    type,
    reason: reason || undefined,
  });
  console.log(chalk.green("Override added!"));
}
