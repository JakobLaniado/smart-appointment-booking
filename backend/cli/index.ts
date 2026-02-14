#!/usr/bin/env node
import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { ApiClient } from "./api-client.js";
import { registerFlow, loginFlow } from "./commands/auth.js";
import { providerMenu } from "./commands/provider.js";
import { bookingMenu } from "./commands/booking.js";
import { agentChat } from "./commands/agent.js";

const BASE_URL = process.env["API_URL"] ?? "http://localhost:3000";

async function main() {
  console.log(
    chalk.bold.blue("\n=== Smart Appointment Booking CLI ===\n"),
  );
  console.log(chalk.dim(`API: ${BASE_URL}\n`));

  const api = new ApiClient(BASE_URL);
  let userRole: string | null = null;
  let providerId: string | undefined;

  // Auth loop
  while (!api.getToken()) {
    const action = await select({
      message: "Welcome! Please authenticate:",
      choices: [
        { name: "Login", value: "login" },
        { name: "Register", value: "register" },
        { name: "Exit", value: "exit" },
      ],
    });

    if (action === "exit") {
      process.exit(0);
    }

    try {
      if (action === "register") {
        await registerFlow(api);
      } else {
        await loginFlow(api);
      }

      // Fetch profile to know role
      const profile = (await api.me()) as {
        role: string;
        providerId?: string;
      };
      userRole = profile.role;
      providerId = profile.providerId;
      console.log(
        chalk.green(`\nWelcome! Role: ${userRole}\n`),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.log(chalk.red(`Error: ${msg}`));
    }
  }

  // Main menu loop
  while (true) {
    const choices =
      userRole === "PROVIDER"
        ? [
            { name: "Manage availability", value: "availability" },
            { name: "View bookings", value: "bookings" },
            { name: "AI Assistant", value: "agent" },
            { name: "Logout", value: "logout" },
          ]
        : [
            { name: "Book an appointment", value: "bookings" },
            { name: "AI Assistant", value: "agent" },
            { name: "Logout", value: "logout" },
          ];

    const action = await select({
      message: "Main menu:",
      choices,
    });

    try {
      switch (action) {
        case "availability":
          await providerMenu(api);
          break;
        case "bookings":
          await bookingMenu(api);
          break;
        case "agent":
          await agentChat(api, userRole!, providerId);
          break;
        case "logout":
          console.log(chalk.yellow("Goodbye!"));
          process.exit(0);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.log(chalk.red(`Error: ${msg}`));
    }
  }
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
