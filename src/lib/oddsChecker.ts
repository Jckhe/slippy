import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getAllWatchingBets, updateBetOdds, updateBetStatus, archiveBet, archiveOldResolvedBets, WatchedBet, ArchivedBet, setLastPolled, getConfig } from "./watchlist.js";

// PST timestamp helper
function getPSTTimestamp(): string {
  return new Date().toLocaleString('en-US', { 
    timeZone: 'America/Los_Angeles', 
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }) + ' PT';
}
import { fetchOdds, fetchScores, findGameInScores, GameScore } from "./odds.js";
import { ENV } from "./env.js";

let updateInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let lastClient: Client | null = null;
let nextPollTime: Date | null = null;
let currentPollingInterval = 30; // in minutes

// Get the next scheduled poll time
export function getNextPollTime(): Date | null {
  return nextPollTime;
}

// Get current polling interval
export function getCurrentPollingInterval(): number {
  return currentPollingInterval;
}

// Start the background job for checking odds
export function startOddsChecker(client: Client, intervalMinutes = 30) {
  console.log(`[ODDS-CHECKER] Starting background job (every ${intervalMinutes} min)`);
  lastClient = client;
  currentPollingInterval = intervalMinutes;
  
  // Run immediately on start, then every X minutes
  checkAllBets(client);
  
  // Schedule next poll
  nextPollTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
  
  updateInterval = setInterval(() => {
    checkAllBets(client);
    nextPollTime = new Date(Date.now() + intervalMinutes * 60 * 1000);
  }, intervalMinutes * 60 * 1000);
  
  // Run archive cleanup every 6 hours
  cleanupInterval = setInterval(() => {
    archiveOldResolvedBets(24); // Archive bets resolved more than 24 hours ago
  }, 6 * 60 * 60 * 1000);
}

export function stopOddsChecker() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  console.log('[ODDS-CHECKER] Stopped background jobs');
}

// Manual trigger for refresh
export async function checkAllBetsNow(): Promise<void> {
  if (lastClient) {
    await checkAllBets(lastClient);
  } else {
    console.log('[ODDS-CHECKER] No client available for manual refresh');
  }
}

async function checkAllBets(client: Client) {
  const bets = getAllWatchingBets();
  
  // Update last polled time
  setLastPolled(new Date());
  
  if (bets.length === 0) {
    console.log('[ODDS-CHECKER] No watching bets to check');
    return;
  }

  console.log(`[ODDS-CHECKER] Checking ${bets.length} watching bet(s)...`);

  try {
    // Fetch current odds and scores from The Odds API
    // Don't filter odds to today - we need to check all tracked bets including ones from yesterday
    const [oddsData, scoresData] = await Promise.all([
      fetchOdds(false).catch(e => { console.error('[ODDS-CHECKER] Odds fetch failed:', e); return []; }),
      fetchScores(3).catch(e => { console.error('[ODDS-CHECKER] Scores fetch failed:', e); return []; }) // Check last 3 days
    ]);
    
    console.log(`[ODDS-CHECKER] Got ${oddsData.length} games with odds, ${scoresData.length} games with scores`);

    // Group bets by game to minimize processing
    const gameGroups = new Map<string, WatchedBet[]>();
    for (const bet of bets) {
      const key = bet.game;
      if (!gameGroups.has(key)) {
        gameGroups.set(key, []);
      }
      gameGroups.get(key)!.push(bet);
    }

    // Check each unique game
    for (const [game, gameBets] of gameGroups) {
      try {
        await checkGameWithOddsAPI(client, game, gameBets, oddsData, scoresData);
      } catch (error) {
        console.error(`[ODDS-CHECKER] Error checking ${game}:`, error);
      }
    }
  } catch (error) {
    console.error('[ODDS-CHECKER] Error in checkAllBets:', error);
  }
}

async function checkGameWithOddsAPI(
  client: Client, 
  game: string, 
  bets: WatchedBet[], 
  oddsData: any[], 
  scoresData: GameScore[]
) {
  console.log(`[ODDS-CHECKER] Checking: ${game}`);

  // Find the game in scores
  const gameScore = findGameInScores(scoresData, game);
  
  // Find the game in odds for line updates
  const gameNameLower = game.toLowerCase();
  const gameOdds = oddsData.find((g: any) => {
    const home = g.home_team?.toLowerCase() || '';
    const away = g.away_team?.toLowerCase() || '';
    const homeMascot = home.split(' ').pop() || '';
    const awayMascot = away.split(' ').pop() || '';
    return gameNameLower.includes(homeMascot) && gameNameLower.includes(awayMascot);
  });
  
  // If game is completed, resolve the bets
  if (gameScore?.completed && gameScore.home_score !== null && gameScore.away_score !== null) {
    console.log(`[ODDS-CHECKER] Game completed: ${gameScore.away_team} ${gameScore.away_score} @ ${gameScore.home_team} ${gameScore.home_score}`);
    
    for (const bet of bets) {
      const outcome = determineOutcome(bet, gameScore);
      const finalScore = `${gameScore.away_team} ${gameScore.away_score} - ${gameScore.home_team} ${gameScore.home_score}`;
      
      console.log(`[ODDS-CHECKER] Bet #${bet.id} "${bet.pick}" => ${outcome}`);
      
      // Only archive if we have a definite outcome
      if (outcome !== 'watching') {
        // Archive the bet
        archiveBet(bet.id, outcome, bet.current_odds || bet.original_odds || '', finalScore);
        
        // Post update to channel
        await postBetUpdate(client, bet, outcome, { score: finalScore });
      } else {
        console.log(`[ODDS-CHECKER] Could not determine outcome for bet #${bet.id}, keeping as watching`);
      }
    }
    return;
  }
  
  // If game has odds, update line movements
  if (gameOdds) {
    for (const bet of bets) {
      // Get current spread/total from odds
      let newOdds: string | null = null;
      
      for (const bookmaker of gameOdds.bookmakers || []) {
        for (const market of bookmaker.markets || []) {
          if (market.key === 'spreads' && bet.bet_type === 'game') {
            // Find the relevant spread
            for (const outcome of market.outcomes || []) {
              const pickLower = bet.pick.toLowerCase();
              const teamLower = outcome.name.toLowerCase();
              if (pickLower.includes(teamLower.split(' ').pop() || '')) {
                newOdds = `${outcome.name} ${outcome.point > 0 ? '+' : ''}${outcome.point}`;
                break;
              }
            }
          } else if (market.key === 'totals' && (bet.pick.toLowerCase().includes('over') || bet.pick.toLowerCase().includes('under'))) {
            for (const outcome of market.outcomes || []) {
              newOdds = `${outcome.point}`;
              break;
            }
          }
        }
        if (newOdds) break;
      }
      
      // Update if odds changed
      if (newOdds && newOdds !== bet.current_odds) {
        const oldOdds = bet.current_odds || bet.original_odds || '';
        
        if (oldOdds) {
          await checkAndAlertMovement(client, bet, oldOdds, newOdds);
        }
        
        updateBetOdds(bet.id, newOdds);
        console.log(`[ODDS-CHECKER] Line movement for bet #${bet.id}: ${oldOdds} → ${newOdds}`);
      }
    }
  } else {
    console.log(`[ODDS-CHECKER] No odds/scores found for ${game} - game may have started or not be available`);
  }
}

function determineOutcome(bet: WatchedBet, gameScore: GameScore): WatchedBet['status'] {
  const pick = bet.pick.toLowerCase();
  const line = bet.line || bet.original_odds || '';
  
  const homeScore = gameScore.home_score || 0;
  const awayScore = gameScore.away_score || 0;
  const totalScore = homeScore + awayScore;
  
  const homeTeam = gameScore.home_team.toLowerCase();
  const awayTeam = gameScore.away_team.toLowerCase();
  const homeMascot = homeTeam.split(' ').pop() || '';
  const awayMascot = awayTeam.split(' ').pop() || '';
  
  console.log(`[ODDS-CHECKER] Determining outcome for "${bet.pick}" with line "${line}"`);
  console.log(`[ODDS-CHECKER] Score: ${awayTeam} ${awayScore} @ ${homeTeam} ${homeScore}`);
  
  // Handle Over/Under bets
  if (pick.includes('over') || pick.includes('under')) {
    const lineNum = parseOddsNumber(line);
    if (lineNum === null) {
      console.log(`[ODDS-CHECKER] Could not parse total line: ${line}`);
      return 'watching';
    }
    
    if (pick.includes('over')) {
      if (totalScore > lineNum) return 'won';
      if (totalScore < lineNum) return 'lost';
      return 'push';
    } else {
      if (totalScore < lineNum) return 'won';
      if (totalScore > lineNum) return 'lost';
      return 'push';
    }
  }
  
  // Handle spread bets
  const spreadMatch = line.match(/([+-]?\d+\.?\d*)/);
  if (spreadMatch) {
    const spread = parseFloat(spreadMatch[1]);
    
    // Determine which team was picked
    let pickedHome = false;
    if (pick.includes(homeMascot) || pick.includes(homeTeam.split(' ')[0])) {
      pickedHome = true;
    } else if (pick.includes(awayMascot) || pick.includes(awayTeam.split(' ')[0])) {
      pickedHome = false;
    } else {
      // Try to infer from the spread sign in the pick
      if (pick.includes('-')) {
        // Negative spread usually means favorite
        pickedHome = homeScore > awayScore; // Assume we picked the winner pre-game
      } else {
        pickedHome = homeScore < awayScore;
      }
    }
    
    // Calculate if spread covered
    const margin = pickedHome ? (homeScore - awayScore) : (awayScore - homeScore);
    const adjustedMargin = margin + spread;
    
    console.log(`[ODDS-CHECKER] Picked ${pickedHome ? 'HOME' : 'AWAY'}, spread: ${spread}, margin: ${margin}, adjusted: ${adjustedMargin}`);
    
    if (adjustedMargin > 0) return 'won';
    if (adjustedMargin < 0) return 'lost';
    return 'push';
  }
  
  // Handle moneyline bets (no spread)
  if (pick.includes(homeMascot) || pick.includes(homeTeam.split(' ')[0])) {
    return homeScore > awayScore ? 'won' : 'lost';
  } else if (pick.includes(awayMascot) || pick.includes(awayTeam.split(' ')[0])) {
    return awayScore > homeScore ? 'won' : 'lost';
  }
  
  console.log(`[ODDS-CHECKER] Could not determine outcome for bet`);
  return 'watching';
}

// Extract numeric value from odds string like "IND +10.5" or "-9.5"
function parseOddsNumber(odds: string): number | null {
  // First try to match a signed number (spread)
  const signedMatch = odds.match(/([+-]\d+\.?\d*)/);
  if (signedMatch) return parseFloat(signedMatch[1]);
  // Fall back to unsigned number (totals like "225.5")
  const numMatch = odds.match(/(\d+\.?\d*)/);
  return numMatch ? parseFloat(numMatch[1]) : null;
}

// Check for significant line movement and alert if needed
async function checkAndAlertMovement(client: Client, bet: WatchedBet, oldOdds: string, newOdds: string) {
  try {
    // Get user config
    const config = getConfig(bet.user_id);
    
    // Skip if user has alerts disabled
    if (!config.notifications_enabled || !config.line_movement_alerts) {
      return;
    }
    
    // Calculate movement
    const oldNum = parseOddsNumber(oldOdds);
    const newNum = parseOddsNumber(newOdds);
    
    if (oldNum === null || newNum === null) {
      return;
    }
    
    const movement = Math.abs(newNum - oldNum);
    
    // Only alert if movement exceeds threshold
    if (movement < config.movement_threshold) {
      return;
    }
    
    console.log(`[ODDS-CHECKER] Significant movement detected: ${movement} >= ${config.movement_threshold}`);
    
    // Send alert to channel
    const channel = await client.channels.fetch(bet.channel_id) as TextChannel;
    if (!channel || !channel.isTextBased()) return;
    
    const direction = newNum > oldNum ? '📈' : '📉';
    const moveStr = newNum > oldNum ? `+${movement.toFixed(1)}` : `-${movement.toFixed(1)}`;
    const favorability = determineFavorability(bet.pick, oldNum, newNum);
    
    const embed = new EmbedBuilder()
      .setColor(favorability === 'favorable' ? 0x00FF00 : favorability === 'unfavorable' ? 0xFF0000 : 0xFFA500)
      .setTitle(`${direction} Line Movement Alert`)
      .setDescription(`Significant line movement detected on your tracked bet!`)
      .addFields(
        { name: '🎯 Game', value: bet.game, inline: false },
        { name: '📌 Your Pick', value: bet.pick, inline: true },
        { name: '🔄 Movement', value: moveStr, inline: true },
        { name: '📊 Line Change', value: `${oldOdds} → ${newOdds}`, inline: false }
      )
      .setFooter({ text: `${favorability === 'favorable' ? '✅ Line moved in your favor!' : favorability === 'unfavorable' ? '⚠️ Line moved against you' : 'Line movement detected'} • ${getPSTTimestamp()}` });
    
    await channel.send({
      content: `<@${bet.user_id}> 🚨 Line movement alert!`,
      embeds: [embed]
    });
    
    console.log(`[ODDS-CHECKER] Sent movement alert for bet #${bet.id}`);
  } catch (error) {
    console.error(`[ODDS-CHECKER] Failed to send movement alert:`, error);
  }
}

// Determine if line movement is favorable or unfavorable
function determineFavorability(pick: string, oldNum: number, newNum: number): 'favorable' | 'unfavorable' | 'neutral' {
  const pickLower = pick.toLowerCase();
  
  // For spread bets - if you have the underdog (+), line getting bigger is good
  // If you have favorite (-), line getting smaller (more negative) is bad
  if (pickLower.includes('+')) {
    // Underdog bet - bigger spread is better
    return newNum > oldNum ? 'favorable' : 'unfavorable';
  } else if (pickLower.includes('-')) {
    // Favorite bet - smaller (less negative) spread is better
    return newNum > oldNum ? 'favorable' : 'unfavorable';
  }
  
  // For over/under
  if (pickLower.includes('over')) {
    // Total going down is favorable for over bets
    return newNum < oldNum ? 'favorable' : 'unfavorable';
  } else if (pickLower.includes('under')) {
    // Total going up is favorable for under bets
    return newNum > oldNum ? 'favorable' : 'unfavorable';
  }
  
  return 'neutral';
}

async function postBetUpdate(client: Client, bet: WatchedBet, outcome: WatchedBet['status'], gameData: any) {
  try {
    const channel = await client.channels.fetch(bet.channel_id) as TextChannel;
    if (!channel || !channel.isTextBased()) return;

    const colors: Record<string, number> = {
      won: 0x00FF00,
      lost: 0xFF0000,
      push: 0x808080,
      watching: 0xFFA500,
      cancelled: 0x404040
    };

    const emojis: Record<string, string> = {
      won: '✅',
      lost: '❌',
      push: '➖',
      watching: '👀',
      cancelled: '🚫'
    };

    const embed = new EmbedBuilder()
      .setColor(colors[outcome])
      .setTitle(`${emojis[outcome]} Bet Update: ${bet.game}`)
      .addFields(
        { name: 'Pick', value: bet.pick, inline: true },
        { name: 'Line', value: bet.line, inline: true },
        { name: 'Result', value: outcome.toUpperCase(), inline: true }
      )
      .setFooter({ text: `Resolved ${getPSTTimestamp()}` });

    if (gameData.score) {
      embed.addFields({ name: 'Final Score', value: gameData.score });
    }

    await channel.send({
      content: `<@${bet.user_id}> Your bet has been resolved!`,
      embeds: [embed]
    });

    console.log(`[ODDS-CHECKER] Posted update for bet #${bet.id}`);
  } catch (error) {
    console.error(`[ODDS-CHECKER] Failed to post update for bet #${bet.id}:`, error);
  }
}

// Manual refresh for a specific bet or all bets
export async function manualRefresh(client: Client) {
  await checkAllBets(client);
}
