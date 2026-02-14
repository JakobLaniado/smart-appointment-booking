import { input, select, password } from "@inquirer/prompts";
import chalk from "chalk";
import type { ApiClient } from "../api-client.js";

export async function registerFlow(api: ApiClient) {
  console.log(chalk.bold("\n--- Register ---\n"));

  const name = await input({ message: "Full name:" });
  const email = await input({ message: "Email:" });
  const pw = await password({ message: "Password:" });
  const role = await select({
    message: "Role:",
    choices: [
      { name: "Customer", value: "CUSTOMER" },
      { name: "Provider", value: "PROVIDER" },
    ],
  });

  let profession: string | undefined;
  let timezone: string | undefined;
  if (role === "PROVIDER") {
    profession = await input({ message: "Profession:" });
    timezone = await input({
      message: "Timezone (IANA):",
      default: "America/New_York",
    });
  }

  const result = await api.register({
    email,
    password: pw,
    name,
    role,
    profession,
    timezone,
  });
  console.log(chalk.green("\nRegistered successfully!"));
  console.log(result);
  return result;
}

export async function loginFlow(api: ApiClient) {
  console.log(chalk.bold("\n--- Login ---\n"));

  const email = await input({ message: "Email:" });
  const pw = await password({ message: "Password:" });

  const result = await api.login(email, pw);
  console.log(chalk.green("\nLogged in!"));
  return result;
}
