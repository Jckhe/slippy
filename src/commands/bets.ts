import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { getUserWatchlist, clearUserWatchlist, removeBet, updateBetStatus, getUserBetHistory, WatchedBet, getUserArchive, getUserStats, ArchivedBet, addWatchedBet, getLastPolled } from "../lib/watchlist.js";
import { getNextPollTime, getCurrentPollingInterval } from "../lib/oddsChecker.js";

// PST timestamp helper
function getPSTTimestamp(): string {
  return new Date().toLocaleString('en-US', { 
    timeZone: 'America/Los_Angeles', 
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }) + ' PT';
}

export const data = new SlashCommandBuilder()
  .setName("bets")
  .setDescription("View and manage tracked bets")
  .addSubcommand(sub =>
    sub.setName("view")
      .setDescription("View current tracked bets (public)")
  )
  .addSubcommand(sub =>
    sub.setName("add")
      .setDescription("Manually add a bet to track")
      .addStringOption(opt =>
        opt.setName("type")
          .setDescription("Type of bet")
          .setRequired(true)
          .addChoices(
            { name: "🏀 Game (spread/ML/total)", value: "game" },
            { name: "📊 Player Prop", value: "prop" }
          )
      )
      .addStringOption(opt =>
        opt.setName("game")
          .setDescription("The game (e.g., 'Lakers @ Celtics')")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("pick")
          .setDescription("Your pick (e.g., 'Lakers -3.5' or 'LeBron Over 25.5 pts')")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("line")
          .setDescription("The line/odds (e.g., '-110' or '-3.5 (-110)')")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub.setName("history")
      .setDescription("View your bet history (resolved bets)")
  )
  .addSubcommand(sub =>
    sub.setName("stats")
      .setDescription("View your betting stats and archived history")
  )
  .addSubcommand(sub =>
    sub.setName("clear")
      .setDescription("Clear all watching bets")
  )
  .addSubcommand(sub =>
    sub.setName("resolve")
      .setDescription("Manually resolve a bet")
      .addIntegerOption(opt =>
        opt.setName("id")
          .setDescription("Bet ID to resolve")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName("outcome")
          .setDescription("Bet outcome")
          .setRequired(true)
          .addChoices(
            { name: "✅ Won", value: "won" },
            { name: "❌ Lost", value: "lost" },
            { name: "➖ Push", value: "push" },
            { name: "🚫 Cancelled", value: "cancelled" }
          )
      )
  );

const STATUS_COLORS: Record<string, number> = {
  watching: 0xFFA500, // Orange
  won: 0x00FF00,      // Green
  lost: 0xFF0000,     // Red
  push: 0x808080,     // Gray
  cancelled: 0x404040 // Dark gray
};

const STATUS_EMOJI: Record<string, string> = {
  watching: '👀',
  won: '✅',
  lost: '❌',
  push: '➖',
  cancelled: '🚫'
};

function formatBetEmbed(bets: WatchedBet[], title: string, showStatus = false): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle(title);

  if (bets.length === 0) {
    embed.setDescription('No bets found. Use `/slate` and click "Track Bets" to add some!');
    return embed;
  }

  // Add last polled info
  const lastPolled = getLastPolled();
  const nextPoll = getNextPollTime();
  const pollingInterval = getCurrentPollingInterval();
  
  const polledStr = lastPolled 
    ? lastPolled.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'short', timeStyle: 'short' })
    : 'Never';
  
  // Calculate time until next poll
  let nextPollStr = 'Unknown';
  if (nextPoll) {
    const minsUntil = Math.max(0, Math.round((nextPoll.getTime() - Date.now()) / 60000));
    nextPollStr = minsUntil === 0 ? 'Now' : `~${minsUntil} min`;
  }
  
  embed.setDescription(`📡 **Last Check:** ${polledStr} PT\n⏱️ **Next Check:** ${nextPollStr} (every ${pollingInterval}m)`);

  for (const bet of bets.slice(0, 8)) { // Limit to 8 for better formatting
    const statusEmoji = showStatus ? `${STATUS_EMOJI[bet.status]} ` : '🎯';
    const typeEmoji = bet.bet_type === 'prop' ? '📊' : '🏀';
    
    // Build card-style content
    let value = `\`\`\`\n`;
    value += `📌 Pick: ${bet.pick}\n`;
    
    // Show original vs current line
    if (bet.original_odds && bet.current_odds) {
      value += `📊 Original: ${bet.original_odds}\n`;
      
      // Check if line changed
      if (bet.current_odds !== bet.original_odds) {
        value += `📈 Current:  ${bet.current_odds}\n`;
        
        // Calculate numeric movement - look for signed numbers first
        const origSigned = bet.original_odds.match(/([+-]\d+\.?\d*)/);
        const currSigned = bet.current_odds.match(/([+-]\d+\.?\d*)/);
        
        // Fall back to unsigned if no sign found
        const origMatch = origSigned || bet.original_odds.match(/(\d+\.?\d*)/);
        const currMatch = currSigned || bet.current_odds.match(/(\d+\.?\d*)/);
        
        if (origMatch && currMatch) {
          const origNum = parseFloat(origMatch[1]);
          const currNum = parseFloat(currMatch[1]);
          const diff = currNum - origNum;
          
          if (diff !== 0) {
            const direction = diff > 0 ? '↑' : '↓';
            const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
            value += `🔄 Movement: ${diffStr} ${direction}\n`;
          }
        }
      } else {
        value += `➖ No line movement\n`;
      }
    } else {
      value += `📊 Line: ${bet.line}\n`;
    }
    
    // Add game time if available
    if (bet.game_time) {
      value += `⏰ Game: ${bet.game_time}\n`;
    }
    
    // Add when bet was placed
    if (bet.created_at) {
      const placedDate = new Date(bet.created_at);
      value += `📅 Placed: ${placedDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}\n`;
    }
    
    value += `\`\`\``;
    
    const fieldTitle = `${statusEmoji} ${typeEmoji} #${bet.id} │ ${bet.game}`;
    embed.addFields({ name: fieldTitle, value, inline: false });
  }

  if (bets.length > 8) {
    embed.setFooter({ text: `Showing 8 of ${bets.length} bets • Use /bets history for resolved bets` });
  } else {
    embed.setFooter({ text: `${bets.length} active bet(s) • Polls every 30 min` });
  }

  return embed;
}

export async function execute(i: any) {
  const subcommand = i.options.getSubcommand();
  console.log('[BETS] Command:', subcommand, 'User:', i.user.id);

  switch (subcommand) {
    case 'view': {
      const bets = getUserWatchlist(i.user.id);
      const embed = formatBetEmbed(bets, '🎯 Tracked Bets');
      
      // Create action buttons row
      const refreshBtn = new ButtonBuilder()
        .setCustomId('bets_refresh')
        .setLabel('🔄 Refresh')
        .setStyle(ButtonStyle.Secondary);
      
      const configBtn = new ButtonBuilder()
        .setCustomId('bets_config')
        .setLabel('⚙️ Configure')
        .setStyle(ButtonStyle.Secondary);
      
      const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(refreshBtn, configBtn);
      
      // Add remove dropdown if there are bets
      if (bets.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('bets_remove')
          .setPlaceholder('Remove a bet...')
          .addOptions(
            bets.slice(0, 25).map(bet => ({
              label: `#${bet.id} ${bet.game}`,
              description: bet.pick.substring(0, 50),
              value: bet.id.toString()
            }))
          );
        
        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        await i.reply({ embeds: [embed], components: [buttonRow, selectRow] });
      } else {
        await i.reply({ embeds: [embed], components: [buttonRow] });
      }
      break;
    }

    case 'history': {
      const bets = getUserBetHistory(i.user.id);
      const embed = formatBetEmbed(bets, '📜 Bet History', true);
      
      // Calculate stats
      const won = bets.filter(b => b.status === 'won').length;
      const lost = bets.filter(b => b.status === 'lost').length;
      const push = bets.filter(b => b.status === 'push').length;
      
      if (bets.length > 0) {
        const winRate = ((won / (won + lost)) * 100).toFixed(1);
        embed.setDescription(`**Record:** ${won}W - ${lost}L - ${push}P | **Win Rate:** ${winRate}%`);
      }
      
      await i.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'add': {
      const betType = i.options.getString('type', true) as 'game' | 'prop';
      const game = i.options.getString('game', true);
      const pick = i.options.getString('pick', true);
      const line = i.options.getString('line') || 'N/A';
      
      const betId = addWatchedBet({
        user_id: i.user.id,
        guild_id: i.guildId || '',
        channel_id: i.channelId || '',
        message_id: null,
        bet_type: betType,
        game: game,
        pick: pick,
        line: line,
        original_odds: line,
        current_odds: line,
        analysis: 'Manually added',
        game_time: null
      });
      
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Bet Added')
        .addFields(
          { name: '🎮 Game', value: game, inline: true },
          { name: '🎯 Pick', value: pick, inline: true },
          { name: '📊 Line', value: line, inline: true },
          { name: '🏷️ Type', value: betType === 'game' ? '🏀 Game' : '📊 Player Prop', inline: true },
          { name: '🆔 Bet ID', value: `#${betId}`, inline: true }
        )
        .setFooter({ text: `Use /bets resolve to mark outcome • ${getPSTTimestamp()}` });
      
      await i.reply({ embeds: [embed], ephemeral: true });
      console.log('[BETS] Manual bet added:', betId, game, pick);
      break;
    }

    case 'clear': {
      const count = clearUserWatchlist(i.user.id);
      await i.reply({
        content: count > 0 
          ? `🗑️ Cleared ${count} bet(s).`
          : '📭 No tracked bets to clear.',
        ephemeral: true
      });
      break;
    }

    case 'resolve': {
      const id = i.options.getInteger('id', true);
      const outcome = i.options.getString('outcome', true) as WatchedBet['status'];
      
      updateBetStatus(id, outcome);
      
      const emoji = STATUS_EMOJI[outcome];
      await i.reply({
        content: `${emoji} Bet #${id} marked as **${outcome}**.`,
        ephemeral: true
      });
      break;
    }

    case 'stats': {
      const stats = getUserStats(i.user.id);
      const archive = getUserArchive(i.user.id, 5); // Last 5 archived bets
      
      const embed = new EmbedBuilder()
        .setColor(0x00BFFF)
        .setTitle('📊 Your Betting Stats')
        .setFooter({ text: getPSTTimestamp() });
      
      if (stats.total === 0) {
        embed.setDescription('No resolved bets yet. Track some bets and wait for games to finish!');
      } else {
        const winRate = stats.total > 0 ? ((stats.won / (stats.won + stats.lost || 1)) * 100).toFixed(1) : '0.0';
        
        embed.setDescription([
          `**📈 Overall Record:** ${stats.won}W - ${stats.lost}L - ${stats.push}P`,
          `**🎯 Win Rate:** ${winRate}%`,
          `**📝 Total Resolved:** ${stats.total}`,
        ].join('\n'));
        
        // Show recent archive
        if (archive.length > 0) {
          const archiveText = archive.map(bet => {
            const outcome = bet.outcome === 'won' ? '✅' : bet.outcome === 'lost' ? '❌' : '➖';
            const movementNum = bet.line_movement ? parseFloat(bet.line_movement) : 0;
            const movement = bet.line_movement ? ` (${movementNum > 0 ? '+' : ''}${bet.line_movement})` : '';
            const score = bet.final_score ? ` | Final: ${bet.final_score}` : '';
            return `${outcome} ${bet.game}: ${bet.pick}${movement}${score}`;
          }).join('\n');
          
          embed.addFields({ 
            name: '🗄️ Recent Archived Bets', 
            value: archiveText.substring(0, 1024) 
          });
        }
      }
      
      await i.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}
