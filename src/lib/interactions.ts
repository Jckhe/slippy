import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { addWatchedBet, getCurrentSlate, removeBet, getUserWatchlist, getConfig, setConfig } from "../lib/watchlist.js";
import { checkAllBetsNow } from "./oddsChecker.js";

// Handle button interactions
export async function handleButton(interaction: any) {
  const customId = interaction.customId;
  console.log('[INTERACTIONS] Button:', customId);

  if (customId === 'track_bets') {
    await handleTrackBetsButton(interaction);
  } else if (customId === 'watchlist_refresh') {
    await handleWatchlistRefresh(interaction);
  } else if (customId === 'watchlist_config') {
    await handleWatchlistConfig(interaction);
  } else if (customId === 'config_toggle_notifications') {
    await handleConfigToggle(interaction, 'notifications_enabled');
  } else if (customId === 'config_toggle_alerts') {
    await handleConfigToggle(interaction, 'line_movement_alerts');
  } else if (customId === 'config_threshold') {
    await handleConfigThreshold(interaction);
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

// Handle modal submissions
export async function handleModalSubmit(interaction: any) {
  const customId = interaction.customId;
  console.log('[INTERACTIONS] Modal:', customId);

  if (customId === 'config_threshold_modal') {
    const thresholdStr = interaction.fields.getTextInputValue('threshold_value');
    const threshold = parseFloat(thresholdStr);
    
    if (isNaN(threshold) || threshold < 0 || threshold > 10) {
      await interaction.reply({
        content: '❌ Invalid threshold. Please enter a number between 0 and 10.',
        ephemeral: true
      });
      return;
    }
    
    setConfig(interaction.user.id, { movement_threshold: threshold });
    
    await interaction.reply({
      content: `✅ Movement threshold set to **${threshold} points**. You'll be alerted when lines move by this amount or more.`,
      ephemeral: true
    });
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

// Manual refresh - triggers immediate odds check for user's bets
async function handleWatchlistRefresh(interaction: any) {
  await interaction.deferReply({ ephemeral: true });
  
  try {
    // Get fresh watchlist
    const bets = getUserWatchlist(interaction.user.id);
    
    if (bets.length === 0) {
      await interaction.editReply('📭 No bets to refresh.');
      return;
    }
    
    // Trigger manual check
    await checkAllBetsNow();
    
    // Show updated watchlist
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('🔄 Watchlist Refreshed')
      .setDescription(`Checked ${bets.length} bet(s) for updates.`)
      .setTimestamp();
    
    for (const bet of bets.slice(0, 5)) {
      const movement = bet.current_odds && bet.original_odds && bet.current_odds !== bet.original_odds
        ? `📈 ${bet.original_odds} → ${bet.current_odds}`
        : '➖ No movement';
      
      embed.addFields({
        name: `#${bet.id} ${bet.game}`,
        value: `**Pick:** ${bet.pick}\n${movement}`,
        inline: true
      });
    }
    
    if (bets.length > 5) {
      embed.setFooter({ text: `Showing 5 of ${bets.length} bets` });
    }
    
    await interaction.editReply({ embeds: [embed] });
    console.log('[INTERACTIONS] Manual refresh completed for', interaction.user.id);
    
  } catch (error) {
    console.error('[INTERACTIONS] Refresh error:', error);
    await interaction.editReply('❌ Error refreshing watchlist.');
  }
}

// Configure watchlist settings
async function handleWatchlistConfig(interaction: any) {
  const config = getConfig(interaction.user.id);
  
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('⚙️ Watchlist Configuration')
    .setDescription('Current settings for your watchlist notifications')
    .addFields(
      { 
        name: '🔔 Notifications', 
        value: config.notifications_enabled ? '✅ Enabled' : '❌ Disabled', 
        inline: true 
      },
      { 
        name: '📊 Line Movement Alerts', 
        value: config.line_movement_alerts ? '✅ Enabled' : '❌ Disabled', 
        inline: true 
      },
      { 
        name: '🎯 Movement Threshold', 
        value: `${config.movement_threshold} points`, 
        inline: true 
      }
    )
    .setFooter({ text: 'Use buttons below to toggle settings' });
  
  const notifyBtn = new ButtonBuilder()
    .setCustomId('config_toggle_notifications')
    .setLabel(config.notifications_enabled ? '🔕 Disable Notifications' : '🔔 Enable Notifications')
    .setStyle(config.notifications_enabled ? ButtonStyle.Secondary : ButtonStyle.Success);
  
  const alertsBtn = new ButtonBuilder()
    .setCustomId('config_toggle_alerts')
    .setLabel(config.line_movement_alerts ? '📉 Disable Alerts' : '📈 Enable Alerts')
    .setStyle(config.line_movement_alerts ? ButtonStyle.Secondary : ButtonStyle.Success);
  
  const thresholdBtn = new ButtonBuilder()
    .setCustomId('config_threshold')
    .setLabel('🎯 Set Threshold')
    .setStyle(ButtonStyle.Primary);
  
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(notifyBtn, alertsBtn, thresholdBtn);
  
  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// Toggle a config setting
async function handleConfigToggle(interaction: any, setting: 'notifications_enabled' | 'line_movement_alerts') {
  const config = getConfig(interaction.user.id);
  const newValue = !config[setting];
  
  setConfig(interaction.user.id, { [setting]: newValue });
  
  const settingName = setting === 'notifications_enabled' ? 'Notifications' : 'Line Movement Alerts';
  const emoji = newValue ? '✅' : '❌';
  
  await interaction.reply({
    content: `${emoji} **${settingName}** ${newValue ? 'enabled' : 'disabled'}.`,
    ephemeral: true
  });
}

// Set threshold via modal
async function handleConfigThreshold(interaction: any) {
  const config = getConfig(interaction.user.id);
  
  const modal = new ModalBuilder()
    .setCustomId('config_threshold_modal')
    .setTitle('Set Movement Threshold');
  
  const thresholdInput = new TextInputBuilder()
    .setCustomId('threshold_value')
    .setLabel('Alert when line moves by (points)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('0.5')
    .setValue(config.movement_threshold.toString())
    .setRequired(true);
  
  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(thresholdInput);
  modal.addComponents(row);
  
  await interaction.showModal(modal);
}
