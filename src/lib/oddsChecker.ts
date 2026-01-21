import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { getAllWatchingBets, updateBetOdds, updateBetStatus, archiveBet, archiveOldResolvedBets, WatchedBet, ArchivedBet, setLastPolled } from "./watchlist.js";
import { openai, waitForResponse } from "./openai.js";
import { ENV } from "./env.js";

let updateInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let lastClient: Client | null = null;

// Start the background job for checking odds
export function startOddsChecker(client: Client, intervalMinutes = 30) {
  console.log(`[ODDS-CHECKER] Starting background job (every ${intervalMinutes} min)`);
  lastClient = client;
  
  // Run immediately on start, then every X minutes
  checkAllBets(client);
  
  updateInterval = setInterval(() => {
    checkAllBets(client);
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

  // Group bets by game to minimize API calls
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
      await checkGameStatus(client, game, gameBets);
    } catch (error) {
      console.error(`[ODDS-CHECKER] Error checking ${game}:`, error);
    }
    
    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function checkGameStatus(client: Client, game: string, bets: WatchedBet[]) {
  console.log(`[ODDS-CHECKER] Checking: ${game}`);

  const prompt = `Check the current status of this NBA game: ${game}

Respond in JSON format only:
{
  "status": "not_started" | "in_progress" | "final",
  "score": "AWAY 105 - HOME 98" or null if not started,
  "current_spread": "-5.5" or null,
  "current_total": "225.5" or null,
  "winner": "AWAY" | "HOME" | null,
  "time_remaining": "Q4 2:30" or "Final" or null
}

Only return JSON, no other text.`;

  try {
    const created = await openai.responses.create({
      model: ENV.OPENAI_MODEL,
      input: prompt,
      tools: [{ type: "web_search_preview" }]
    });

    const r = await waitForResponse(created.id, 30000);
    
    let output = "";
    if (r.output_text) {
      output = r.output_text;
    } else if (r.output && Array.isArray(r.output)) {
      const messageItem = r.output.find((item: any) => item.type === 'message');
      if (messageItem?.content && Array.isArray(messageItem.content)) {
        output = messageItem.content
          .filter((c: any) => c.type === 'output_text' || c.type === 'text')
          .map((c: any) => c.text || c.content || '')
          .join('\n');
      }
    }

    // Parse JSON
    let jsonStr = output;
    const jsonMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const gameData = JSON.parse(jsonStr);
    console.log(`[ODDS-CHECKER] ${game} status:`, gameData.status);

    // Update each bet based on game status
    for (const bet of bets) {
      if (gameData.status === 'final') {
        // Determine if bet won or lost
        const outcome = determineOutcome(bet, gameData);
        
        if (outcome !== 'watching') {
          // Archive the bet with final data
          const finalLine = gameData.current_spread || gameData.current_total || bet.current_odds;
          archiveBet(bet.id, outcome, finalLine, gameData.score);
          
          // Post update to channel
          await postBetUpdate(client, bet, outcome, gameData);
        }
      } else if (gameData.current_spread || gameData.current_total) {
        // Update odds if they've changed
        const newOdds = bet.bet_type === 'game' 
          ? (gameData.current_spread || gameData.current_total)
          : bet.current_odds;
        
        if (newOdds && newOdds !== bet.current_odds) {
          updateBetOdds(bet.id, newOdds);
          console.log(`[ODDS-CHECKER] Line movement: ${bet.current_odds} → ${newOdds}`);
        }
      }
    }
  } catch (error) {
    console.error(`[ODDS-CHECKER] Failed to check ${game}:`, error);
  }
}

function determineOutcome(bet: WatchedBet, gameData: any): WatchedBet['status'] {
  // This is simplified - in production you'd want more sophisticated logic
  // For now, we'll mark as "watching" if we can't determine
  
  if (!gameData.winner || !gameData.score) {
    return 'watching';
  }

  // Parse the pick to determine what side we're on
  const pick = bet.pick.toLowerCase();
  
  // Very simplified logic - would need enhancement for real use
  if (pick.includes('over') || pick.includes('under')) {
    // Total bet - would need to check final score against line
    return 'watching'; // Can't determine without more data
  }
  
  // For spread/ML bets
  // This would need real spread cover logic
  return 'watching';
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
      .setTimestamp();

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
