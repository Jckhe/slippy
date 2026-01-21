import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { addWatchedBet, getCurrentSlate, removeBet, getUserWatchlist } from "../lib/watchlist.js";

// Handle button interactions
export async function handleButton(interaction: any) {
  const customId = interaction.customId;
  console.log('[INTERACTIONS] Button:', customId);

  if (customId === 'track_bets') {
    await handleTrackBetsButton(interaction);
  } else if (customId === 'refresh_watchlist') {
    await handleRefreshWatchlist(interaction);
  }
}

// Handle select menu interactions
export async function handleSelectMenu(interaction: any) {
  const customId = interaction.customId;
  console.log('[INTERACTIONS] Select:', customId);

  if (customId === 'track_games_select') {
    await handleTrackGamesSelect(interaction);
  } else if (customId === 'track_props_select') {
    await handleTrackPropsSelect(interaction);
  } else if (customId === 'watchlist_remove') {
    await handleWatchlistRemove(interaction);
  }
}

// "Track Bets" button clicked - show select menus
async function handleTrackBetsButton(interaction: any) {
  const slate = getCurrentSlate();
  
  if (!slate || !slate.games?.length) {
    await interaction.reply({
      content: '❌ No slate data available. Run `/slate` first to generate picks.',
      ephemeral: true
    });
    return;
  }

  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

  // Games select menu
  if (slate.games?.length > 0) {
    const gamesSelect = new StringSelectMenuBuilder()
      .setCustomId('track_games_select')
      .setPlaceholder('🏀 Select game bets to track...')
      .setMinValues(0)
      .setMaxValues(Math.min(slate.games.length, 25))
      .addOptions(
        slate.games.slice(0, 25).map((game: any, idx: number) => ({
          label: `#${game.rank} ${game.away} @ ${game.home}`,
          description: `${game.pick} (${game.spread})`.substring(0, 50),
          value: `game_${idx}`,
          emoji: game.star ? '⭐' : '🏀'
        }))
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(gamesSelect));
  }

  // Props select menu
  if (slate.props?.length > 0) {
    const propsSelect = new StringSelectMenuBuilder()
      .setCustomId('track_props_select')
      .setPlaceholder('📊 Select props to track...')
      .setMinValues(0)
      .setMaxValues(Math.min(slate.props.length, 25))
      .addOptions(
        slate.props.slice(0, 25).map((prop: any, idx: number) => ({
          label: `#${prop.rank} ${prop.player}`,
          description: `${prop.prop} ${prop.line} ${prop.play}`.substring(0, 50),
          value: `prop_${idx}`,
          emoji: prop.star ? '⭐' : '📊'
        }))
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(propsSelect));
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('📋 Track Bets')
    .setDescription('Select the bets you want to track from today\'s slate.\n\nYou\'ll receive updates on line movement and final outcomes.')
    .setFooter({ text: 'Bets will be tracked until the game ends' });

  await interaction.reply({
    embeds: [embed],
    components: rows,
    ephemeral: true
  });
}

// User selected games to track
async function handleTrackGamesSelect(interaction: any) {
  const slate = getCurrentSlate();
  if (!slate) {
    await interaction.reply({ content: '❌ Slate data expired. Run `/slate` again.', ephemeral: true });
    return;
  }

  const selected = interaction.values;
  let added = 0;

  for (const value of selected) {
    const idx = parseInt(value.replace('game_', ''));
    const game = slate.games[idx];
    if (game) {
      addWatchedBet({
        user_id: interaction.user.id,
        guild_id: interaction.guild?.id || '',
        channel_id: interaction.channel?.id || '',
        message_id: null,
        bet_type: 'game',
        game: `${game.away} @ ${game.home}`,
        pick: game.pick,
        line: game.spread,
        original_odds: game.spread,
        current_odds: game.spread,
        analysis: game.analysis,
        game_time: null
      });
      added++;
    }
  }

  await interaction.reply({
    content: added > 0 
      ? `✅ Added **${added}** game bet(s) to your watchlist!\n\nUse \`/watchlist view\` to see your tracked bets.`
      : '⚠️ No bets selected.',
    ephemeral: true
  });
}

// User selected props to track
async function handleTrackPropsSelect(interaction: any) {
  const slate = getCurrentSlate();
  if (!slate) {
    await interaction.reply({ content: '❌ Slate data expired. Run `/slate` again.', ephemeral: true });
    return;
  }

  const selected = interaction.values;
  let added = 0;

  for (const value of selected) {
    const idx = parseInt(value.replace('prop_', ''));
    const prop = slate.props[idx];
    if (prop) {
      addWatchedBet({
        user_id: interaction.user.id,
        guild_id: interaction.guild?.id || '',
        channel_id: interaction.channel?.id || '',
        message_id: null,
        bet_type: 'prop',
        game: prop.player,
        pick: `${prop.prop} ${prop.play}`,
        line: prop.line,
        original_odds: prop.line,
        current_odds: prop.line,
        analysis: prop.analysis,
        game_time: null
      });
      added++;
    }
  }

  await interaction.reply({
    content: added > 0 
      ? `✅ Added **${added}** prop bet(s) to your watchlist!\n\nUse \`/watchlist view\` to see your tracked bets.`
      : '⚠️ No props selected.',
    ephemeral: true
  });
}

// Remove bet from watchlist
async function handleWatchlistRemove(interaction: any) {
  const betId = parseInt(interaction.values[0]);
  const removed = removeBet(betId, interaction.user.id);

  if (removed) {
    // Refresh the watchlist view
    const bets = getUserWatchlist(interaction.user.id);
    
    if (bets.length === 0) {
      await interaction.update({
        content: '🗑️ Bet removed. Your watchlist is now empty.',
        embeds: [],
        components: []
      });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('👀 Your Watchlist')
        .setTimestamp();

      for (const bet of bets.slice(0, 10)) {
        const title = `#${bet.id} | ${bet.game}`;
        let value = `**Pick:** ${bet.pick}\n**Line:** ${bet.line}`;
        embed.addFields({ name: title, value, inline: true });
      }

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
      await interaction.update({ embeds: [embed], components: [row] });
    }
  } else {
    await interaction.reply({
      content: '❌ Could not remove bet. It may already be removed or resolved.',
      ephemeral: true
    });
  }
}

async function handleRefreshWatchlist(interaction: any) {
  await interaction.reply({
    content: '🔄 Refreshing watchlist...',
    ephemeral: true
  });
}
