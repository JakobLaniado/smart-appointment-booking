import { input } from "@inquirer/prompts";
import chalk from "chalk";
import type { ApiClient } from "../api-client.js";

export async function agentChat(
  api: ApiClient,
  role: string,
  providerId?: string,
) {
  console.log(chalk.bold("\n--- AI Scheduling Assistant ---"));
  console.log(
    chalk.dim('Type your message. Type "exit" to return to the menu.\n'),
  );

  if (role === "CUSTOMER") {
    console.log(
      chalk.dim(
        "Tip: You can ask things like \"Show me available slots next week\" or \"Book me a 30-minute appointment\"",
      ),
    );
  } else {
    console.log(
      chalk.dim(
        "Tip: You can ask things like \"Block tomorrow morning\" or \"Show my schedule for next week\"",
      ),
    );
  }

  while (true) {
    const message = await input({ message: chalk.cyan("You:") });

    if (message.toLowerCase() === "exit") {
      break;
    }

    if (!message.trim()) continue;

    try {
      console.log(chalk.dim("Thinking..."));
      const result = (await api.chat(message, providerId)) as {
        response: string;
      };
      console.log(chalk.green(`\nAssistant: ${result.response}\n`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.log(chalk.red(`Error: ${msg}\n`));
    }
  }
}
