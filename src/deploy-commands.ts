import { REST, Routes } from "discord.js";
import { ENV } from "./lib/env.js";
import * as Ask from "./commands/ask.js";
import * as Slate from "./commands/slate.js";

const rest = new REST({version:"10"}).setToken(ENV.DISCORD_TOKEN);
const body = [Ask.data.toJSON(), Slate.data.toJSON()];

await rest.put(
  Routes.applicationGuildCommands(ENV.DISCORD_CLIENT_ID, ENV.DISCORD_GUILD_ID!),
  { body }
);
console.log("Commands deployed");
