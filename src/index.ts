import { Client, Collection, GatewayIntentBits } from "discord.js";
import { ENV } from "./lib/env.js";
import * as Ask from "./commands/ask.js";
import * as Slate from "./commands/slate.js";
import * as Watchlist from "./commands/watchlist.js";
import * as State from "./commands/state.js";
import { handleButton, handleSelectMenu } from "./lib/interactions.js";
import { startOddsChecker } from "./lib/oddsChecker.js";

const c = new Client({ intents:[GatewayIntentBits.Guilds] });
const cmds:any = new Collection();
cmds.set("ask", Ask);
cmds.set("slate", Slate);
cmds.set("watchlist", Watchlist);
cmds.set("state", State);

c.on("interactionCreate", async (i:any)=>{
  // Handle slash commands
  if(i.isChatInputCommand()) {
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
    return;
  }
  
  // Handle button interactions
  if (i.isButton()) {
    try {
      await handleButton(i);
    } catch (error) {
      console.error('[INTERACTION] Button error:', error);
      await i.reply({ content: '❌ Error handling button', ephemeral: true }).catch(console.error);
    }
    return;
  }
  
  // Handle select menu interactions
  if (i.isStringSelectMenu()) {
    try {
      await handleSelectMenu(i);
    } catch (error) {
      console.error('[INTERACTION] Select error:', error);
      await i.reply({ content: '❌ Error handling selection', ephemeral: true }).catch(console.error);
    }
    return;
  }
});

c.once("ready", async ()=>{
  console.log("\n" + "=".repeat(50));
  console.log("✅ BOT READY");
  console.log("=".repeat(50));
  console.log(`[BOT] User: ${c.user?.tag}`);
  console.log(`[BOT] OpenAI Model: ${ENV.OPENAI_MODEL}`);
  console.log(`[BOT] OpenAI Key: ${ENV.OPENAI_API_KEY ? '✅ Set (***' + ENV.OPENAI_API_KEY.slice(-4) + ')' : '❌ Missing'}`);
  console.log(`[BOT] Discord Token: ${ENV.DISCORD_TOKEN ? '✅ Set' : '❌ Missing'}`);
  console.log(`[BOT] Data Dir: ${ENV.DATA_DIR}`);
  console.log("=".repeat(50));
  
  // Send startup message to configured channel
  if (ENV.DISCORD_GUILD_ID) {
    try {
      const guild = c.guilds.cache.get(ENV.DISCORD_GUILD_ID);
      if (guild) {
        // Find a suitable channel (first text channel the bot can send to)
        const channel = guild.channels.cache.find(
          (ch): ch is any => ch.isTextBased() && !ch.isVoice() && ch.permissionsFor(c.user!)?.has('SendMessages') === true
        );
        if (channel) {
          const version = process.env.RENDER_GIT_COMMIT?.slice(0, 7) || 'local';
          await channel.send({
            content: `🟢 **Bot Online** | v${version} | ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'short', timeStyle: 'short' })} PT`
          });
          console.log(`[BOT] Startup message sent to #${channel.name}`);
        }
      }
    } catch (err) {
      console.error('[BOT] Failed to send startup message:', err);
    }
  }
  
  // Start the background odds checker (every 30 minutes)
  startOddsChecker(c, 30);
  console.log("[BOT] 📊 Odds checker started (30 min interval)");
  console.log("=".repeat(50) + "\n");
});
c.login(ENV.DISCORD_TOKEN);
