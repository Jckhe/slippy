import { Client, Collection, GatewayIntentBits } from "discord.js";
import { ENV } from "./lib/env.js";
import * as Ask from "./commands/ask.js";
import * as Slate from "./commands/slate.js";

const c = new Client({ intents:[GatewayIntentBits.Guilds] });
const cmds:any = new Collection();
cmds.set("ask", Ask);
cmds.set("slate", Slate);

c.on("interactionCreate", async (i:any)=>{
  if(!i.isChatInputCommand()) return;
  const cmd = cmds.get(i.commandName);
  console.log(`[INTERACTION] Command: ${i.commandName} by ${i.user?.tag || 'unknown'}`);
  if(cmd) {
    try {
      await cmd.execute(i);
    } catch (error) {
      console.error(`[INTERACTION] Error:`, error);
      const msg = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      if (i.deferred || i.replied) {
        await i.editReply(msg).catch(console.error);
      } else {
        await i.reply({ content: msg, ephemeral: true }).catch(console.error);
      }
    }
  }
});

c.once("ready", ()=>{
  console.log("✅ Bot ready");
  console.log(`[BOT] Logged in as ${c.user?.tag}`);
  console.log(`[BOT] Model: ${ENV.OPENAI_MODEL}`);
});
c.login(ENV.DISCORD_TOKEN);
