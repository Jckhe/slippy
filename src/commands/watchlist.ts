import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { getUserWatchlist, clearUserWatchlist, removeBet, updateBetStatus, getUserBetHistory, WatchedBet, getUserArchive, getUserStats, ArchivedBet } from "../lib/watchlist.js";

export const data = new SlashCommandBuilder()
  .setName("watchlist")
  .setDescription("View and manage your tracked bets")
  .addSubcommand(sub =>
    sub.setName("view")
      .setDescription("View your current watchlist")
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
    .setTitle(title)
    .setTimestamp();

  if (bets.length === 0) {
    embed.setDescription('No bets found. Use `/slate` and click "Track Bets" to add some!');
    return embed;
  }

  for (const bet of bets.slice(0, 10)) { // Limit to 10 fields
    const statusEmoji = showStatus ? `${STATUS_EMOJI[bet.status]} ` : '';
    const title = `${statusEmoji}#${bet.id} | ${bet.game}`;
    
    let value = `**Pick:** ${bet.pick}\n**Line:** ${bet.line}`;
    if (bet.current_odds && bet.original_odds && bet.current_odds !== bet.original_odds) {
      value += `\n**Movement:** ${bet.original_odds} → ${bet.current_odds}`;
    }
    if (bet.game_time) {
      value += `\n**Time:** ${bet.game_time}`;
    }
    
    embed.addFields({ name: title, value, inline: true });
  }

  if (bets.length > 10) {
    embed.setFooter({ text: `Showing 10 of ${bets.length} bets` });
  }

  return embed;
}

export async function execute(i: any) {
  const subcommand = i.options.getSubcommand();
  console.log('[WATCHLIST] Command:', subcommand, 'User:', i.user.id);

  switch (subcommand) {
    case 'view': {
      const bets = getUserWatchlist(i.user.id);
      const embed = formatBetEmbed(bets, '👀 Your Watchlist');
      
      // Add remove buttons if there are bets
      if (bets.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('watchlist_remove')
          .setPlaceholder('Remove a bet...')
          .addOptions(
            bets.slice(0, 25).map(bet => ({
              label: `#${bet.id} ${bet.game}`,
              description: bet.pick.substring(0, 50),
              value: bet.id.toString()
            }))
          );
        
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        await i.reply({ embeds: [embed], components: [row], ephemeral: true });
      } else {
        await i.reply({ embeds: [embed], ephemeral: true });
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

    case 'clear': {
      const count = clearUserWatchlist(i.user.id);
      await i.reply({
        content: count > 0 
          ? `🗑️ Cleared ${count} bet(s) from your watchlist.`
          : '📭 Your watchlist was already empty.',
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
        .setTimestamp();
      
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
