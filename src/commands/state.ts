import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getSlate } from "../lib/store.js";
import { getCachedSlate, getCacheAgeMinutes } from "../lib/slateCache.js";
import { getStateStats, getCurrentSlate as getWatchlistSlate } from "../lib/watchlist.js";

export const data = new SlashCommandBuilder()
  .setName("state")
  .setDescription("View the bot's current state and cache status");

export async function execute(i: any) {
  console.log('[STATE] Command invoked by:', i.user.id);
  
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('🔧 Bot State & Cache Status')
    .setTimestamp();
  
  // 1. Slate Cache Status
  const cachedSlate = getCachedSlate();
  const cacheAge = getCacheAgeMinutes();
  
  if (cachedSlate) {
    const gameCount = cachedSlate.slateJson?.games?.length || 0;
    const propCount = cachedSlate.slateJson?.props?.length || 0;
    const parlayCount = cachedSlate.slateJson?.parlays?.length || 0;
    const sources = cachedSlate.sources?.join(', ') || 'N/A';
    
    embed.addFields({
      name: '📋 Slate Cache',
      value: [
        `**Status:** ✅ Active`,
        `**Age:** ${cacheAge} minutes`,
        `**Date:** ${cachedSlate.date}`,
        `**Games:** ${gameCount}`,
        `**Props:** ${propCount}`,
        `**Parlays:** ${parlayCount}`,
        `**Sources:** ${sources}`,
      ].join('\n'),
      inline: true
    });
  } else {
    embed.addFields({
      name: '📋 Slate Cache',
      value: '**Status:** ❌ Empty/Expired\n*Run `/slate` to generate*',
      inline: true
    });
  }
  
  // 2. In-Memory Store (for /ask context)
  const memorySlate = getSlate();
  embed.addFields({
    name: '🧠 Memory Store',
    value: memorySlate 
      ? `**Raw Slate:** ${memorySlate.length} chars\n*(Used for /ask context)*`
      : '**Raw Slate:** Empty',
    inline: true
  });
  
  // 3. Current Slate for Watchlist
  const watchlistSlate = getWatchlistSlate();
  const watchlistGames = watchlistSlate?.games?.length || 0;
  const watchlistProps = watchlistSlate?.props?.length || 0;
  embed.addFields({
    name: '📌 Active Slate (Watchlist)',
    value: watchlistSlate
      ? `**Games:** ${watchlistGames}\n**Props:** ${watchlistProps}\n*(Available for tracking)*`
      : '**Status:** Empty',
    inline: true
  });
  
  // 4. Database Stats
  const dbStats = getStateStats();
  embed.addFields({
    name: '💾 Database (SQLite)',
    value: [
      `**Watched Bets:** ${dbStats.watchedBets}`,
      `**Archived Bets:** ${dbStats.archivedBets}`,
      `**Unique Users:** ${dbStats.uniqueUsers}`,
      `**Total Resolved:** ${dbStats.resolvedBets}`,
    ].join('\n'),
    inline: true
  });
  
  // 5. Win/Loss Stats
  embed.addFields({
    name: '📊 Global Stats',
    value: [
      `**Won:** ${dbStats.wonBets}`,
      `**Lost:** ${dbStats.lostBets}`,
      `**Push:** ${dbStats.pushBets}`,
      `**Win Rate:** ${dbStats.winRate}%`,
    ].join('\n'),
    inline: true
  });
  
  // 6. System Info
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const memUsage = process.memoryUsage();
  
  embed.addFields({
    name: '⚙️ System',
    value: [
      `**Uptime:** ${hours}h ${minutes}m`,
      `**Memory:** ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      `**Node:** ${process.version}`,
    ].join('\n'),
    inline: true
  });
  
  embed.setFooter({ 
    text: '⚠️ Note: DB resets on redeploy unless using persistent storage' 
  });
  
  await i.reply({ embeds: [embed], ephemeral: true });
  console.log('[STATE] State displayed');
}
