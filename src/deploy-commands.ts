import { REST, Routes } from "discord.js";
import { ENV } from "./lib/env.js";
import * as Ask from "./commands/ask.js";
import * as Slate from "./commands/slate.js";
import * as Bets from "./commands/bets.js";
import * as State from "./commands/state.js";
import * as Analyze from "./commands/analyze.js";

const rest = new REST({version:"10"}).setToken(ENV.DISCORD_TOKEN);
const body = [
  Ask.data.toJSON(), 
  Slate.data.toJSON(), 
  Bets.data.toJSON(), 
  State.data.toJSON(),
  Analyze.data.toJSON()
];

// Delete all existing commands first to ensure clean slate
console.log("🗑️ Clearing existing commands...");
try {
  // Clear guild commands
  await rest.put(
    Routes.applicationGuildCommands(ENV.DISCORD_CLIENT_ID, ENV.DISCORD_GUILD_ID!),
    { body: [] }
  );
  console.log("✅ Guild commands cleared");
  
  // Also clear global commands (in case any were registered globally)
  await rest.put(
    Routes.applicationCommands(ENV.DISCORD_CLIENT_ID),
    { body: [] }
  );
  console.log("✅ Global commands cleared");
} catch (e) {
  console.log("⚠️ Could not clear commands:", e);
}

// Register fresh commands
console.log("📝 Registering commands...");
await rest.put(
  Routes.applicationGuildCommands(ENV.DISCORD_CLIENT_ID, ENV.DISCORD_GUILD_ID!),
  { body }
);
console.log(`✅ ${body.length} commands deployed: ${body.map((c: any) => '/' + c.name).join(', ')}`);
