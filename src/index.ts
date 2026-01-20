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
  if(cmd) await cmd.execute(i);
});

c.once("ready", ()=>console.log("Bot ready"));
c.login(ENV.DISCORD_TOKEN);
