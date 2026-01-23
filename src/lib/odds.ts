import { ENV } from "./env.js";

// Get today's date boundaries in PST
function getTodayBoundsPST(): { start: Date; end: Date } {
  // Get current time in PST
  const nowPST = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const pstDate = new Date(nowPST);
  
  // Start of today (midnight PST)
  const start = new Date(pstDate);
  start.setHours(0, 0, 0, 0);
  
  // End of today (11:59:59 PM PST)
  const end = new Date(pstDate);
  end.setHours(23, 59, 59, 999);
  
  console.log('[ODDS] Today PST bounds:', start.toISOString(), 'to', end.toISOString());
  return { start, end };
}

// Check if a game starts today in PST
function isGameToday(commenceTime: string): boolean {
  const gameTime = new Date(commenceTime);
  const { start, end } = getTodayBoundsPST();
  
  // Convert PST bounds to UTC for comparison
  const startUTC = new Date(start.toLocaleString('en-US', { timeZone: 'UTC' }));
  const endUTC = new Date(end.toLocaleString('en-US', { timeZone: 'UTC' }));
  
  // Actually, let's just compare in PST directly
  const gameTimePST = new Date(gameTime.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const todayPST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  
  return gameTimePST.toDateString() === todayPST.toDateString();
}

export async function fetchOdds(filterToday: boolean = true) {
  const url =
    `https://api.the-odds-api.com/v4/sports/basketball_nba/odds` +
    `?regions=${ENV.ODDS_REGIONS}` +
    `&markets=${ENV.ODDS_MARKETS}` +
    `&bookmakers=${ENV.ODDS_BOOKMAKERS}` +
    `&oddsFormat=american` +
    `&apiKey=${ENV.ODDS_API_KEY}`;

  console.log('[ODDS] 📡 Fetching from The Odds API...');
  console.log('[ODDS] URL:', url.replace(ENV.ODDS_API_KEY, 'REDACTED'));
  
  try {
    const r = await fetch(url);
    console.log('[ODDS] Response status:', r.status, r.statusText);
    
    if (!r.ok) {
      const errorBody = await r.text();
      console.error('[ODDS] ❌ API Error Response Body:', errorBody);
      throw new Error(`Odds API error (${r.status} ${r.statusText}): ${errorBody}`);
    }
    
    let data = await r.json();
    console.log('[ODDS] ✅ Got', data?.length || 0, 'total games');
    
    // Filter to only today's games if requested
    if (filterToday && data?.length > 0) {
      const todayPST = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
      const todayStr = todayPST.toDateString();
      
      data = data.filter((game: any) => {
        if (!game.commence_time) return false;
        const gameTimePST = new Date(new Date(game.commence_time).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        const isToday = gameTimePST.toDateString() === todayStr;
        if (!isToday) {
          console.log(`[ODDS] Filtering out ${game.away_team} @ ${game.home_team} - starts ${gameTimePST.toDateString()} (not today: ${todayStr})`);
        }
        return isToday;
      });
      
      console.log('[ODDS] ✅ After filtering to today (PST):', data.length, 'games');
    }
    
    if (data?.length > 0) {
      console.log('[ODDS] First game:', data[0].away_team, '@', data[0].home_team, '- starts', new Date(data[0].commence_time).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }), 'PT');
    }
    
    return data;
  } catch (error) {
    console.error('[ODDS] ❌ Fetch error:', error);
    throw error;
  }
}

// Fetch player props for a specific event
export async function fetchPlayerProps(eventId: string, market: string = 'player_points') {
  const url =
    `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${eventId}/odds` +
    `?regions=${ENV.ODDS_REGIONS}` +
    `&markets=${market}` +
    `&bookmakers=${ENV.ODDS_BOOKMAKERS}` +
    `&oddsFormat=american` +
    `&apiKey=${ENV.ODDS_API_KEY}`;

  console.log('[ODDS] 📡 Fetching player props...');
  
  try {
    const r = await fetch(url);
    if (!r.ok) {
      const errorBody = await r.text();
      throw new Error(`Odds API error: ${errorBody}`);
    }
    return await r.json();
  } catch (error) {
    console.error('[ODDS] ❌ Props fetch error:', error);
    throw error;
  }
}

// Get all events (games) for today
export async function fetchEvents() {
  const url =
    `https://api.the-odds-api.com/v4/sports/basketball_nba/events` +
    `?apiKey=${ENV.ODDS_API_KEY}`;

  console.log('[ODDS] 📡 Fetching NBA events...');
  
  try {
    const r = await fetch(url);
    if (!r.ok) {
      const errorBody = await r.text();
      throw new Error(`Odds API error: ${errorBody}`);
    }
    return await r.json();
  } catch (error) {
    console.error('[ODDS] ❌ Events fetch error:', error);
    throw error;
  }
}

// Fetch scores for NBA games (completed and in-progress)
export interface GameScore {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  completed: boolean;
  home_score: number | null;
  away_score: number | null;
  last_update: string | null;
}

export async function fetchScores(daysFrom: number = 1): Promise<GameScore[]> {
  const url =
    `https://api.the-odds-api.com/v4/sports/basketball_nba/scores` +
    `?daysFrom=${daysFrom}` +
    `&apiKey=${ENV.ODDS_API_KEY}`;

  console.log('[ODDS] 📡 Fetching NBA scores...');
  
  try {
    const r = await fetch(url);
    if (!r.ok) {
      const errorBody = await r.text();
      console.error('[ODDS] ❌ Scores API Error:', errorBody);
      throw new Error(`Odds API error: ${errorBody}`);
    }
    const data = await r.json();
    console.log('[ODDS] ✅ Got scores for', data?.length || 0, 'games');
    
    return data.map((g: any) => ({
      id: g.id,
      home_team: g.home_team,
      away_team: g.away_team,
      commence_time: g.commence_time,
      completed: g.completed || false,
      home_score: g.scores?.find((s: any) => s.name === g.home_team)?.score ?? null,
      away_score: g.scores?.find((s: any) => s.name === g.away_team)?.score ?? null,
      last_update: g.last_update
    }));
  } catch (error) {
    console.error('[ODDS] ❌ Scores fetch error:', error);
    throw error;
  }
}

// Find a game in scores by team names
export function findGameInScores(scores: GameScore[], gameName: string): GameScore | undefined {
  const gameNameLower = gameName.toLowerCase();
  
  return scores.find(score => {
    const home = score.home_team.toLowerCase();
    const away = score.away_team.toLowerCase();
    
    // Check if the game name contains parts of either team name
    const homeCity = home.split(' ').slice(0, -1).join(' ');
    const homeMascot = home.split(' ').pop() || '';
    const awayCity = away.split(' ').slice(0, -1).join(' ');
    const awayMascot = away.split(' ').pop() || '';
    
    return gameNameLower.includes(homeMascot) && gameNameLower.includes(awayMascot) ||
           gameNameLower.includes(homeCity) && gameNameLower.includes(awayCity) ||
           gameNameLower.includes(home) || gameNameLower.includes(away);
  });
}

// Search for a specific bet in the odds data
export interface OddsSearchResult {
  found: boolean;
  game?: string;
  eventId?: string;
  homeTeam?: string;
  awayTeam?: string;
  currentSpread?: { team: string; points: number; price: number }[];
  currentTotal?: { type: string; points: number; price: number }[];
  currentML?: { team: string; price: number }[];
  playerProps?: { player: string; market: string; line: number; overPrice: number; underPrice: number }[];
  bookmakers?: string[];
  commenceTime?: string;
}

// Common NBA player to team mappings (update as needed)
const PLAYER_TEAM_MAP: Record<string, string[]> = {
  'lebron': ['lakers'],
  'james': ['lakers'], // LeBron James
  'curry': ['warriors'],
  'steph': ['warriors'],
  'durant': ['suns'],
  'giannis': ['bucks'],
  'antetokounmpo': ['bucks'],
  'jokic': ['nuggets'],
  'nikola': ['nuggets'],
  'embiid': ['76ers', 'sixers'],
  'luka': ['mavericks', 'mavs'],
  'doncic': ['mavericks', 'mavs'],
  'tatum': ['celtics'],
  'jayson': ['celtics'],
  'sga': ['thunder'],
  'shai': ['thunder'],
  'gilgeous': ['thunder'],
  'anthony': ['lakers', 'pelicans'], // AD or Edwards context matters
  'davis': ['lakers'],
  'edwards': ['timberwolves', 'wolves'],
  'morant': ['grizzlies'],
  'ja': ['grizzlies'],
  'booker': ['suns'],
  'devin': ['suns'],
  'mitchell': ['cavaliers', 'cavs'],
  'donovan': ['cavaliers', 'cavs'],
  'brunson': ['knicks'],
  'jalen': ['knicks'],
  'haliburton': ['pacers'],
  'tyrese': ['pacers'],
  'fox': ['kings'],
  'sabonis': ['kings'],
  'young': ['hawks'],
  'trae': ['hawks'],
  'westbrook': ['nuggets', 'clippers'],
  'kawhi': ['clippers'],
  'leonard': ['clippers'],
  'george': ['76ers', 'sixers'],
  'paul': ['76ers', 'sixers', 'spurs'],
  'harden': ['clippers'],
  'lillard': ['bucks'],
  'dame': ['bucks'],
  'towns': ['knicks'],
  'kat': ['knicks'],
  'butler': ['heat'],
  'jimmy': ['heat'],
  'bam': ['heat'],
  'adebayo': ['heat'],
  'zion': ['pelicans'],
  'williamson': ['pelicans'],
  'ingram': ['pelicans'],
  'brandon': ['pelicans'],
  'wemby': ['spurs'],
  'wembanyama': ['spurs'],
  'victor': ['spurs'],
  'chet': ['thunder'],
  'holmgren': ['thunder'],
  'green': ['warriors', 'rockets'],
  'draymond': ['warriors'],
  'poole': ['wizards'],
  'jordan': ['wizards'],
};

export async function searchOddsForBet(betQuery: string): Promise<OddsSearchResult> {
  try {
    // Fetch current odds
    const oddsData = await fetchOdds();
    
    if (!oddsData || oddsData.length === 0) {
      return { found: false };
    }
    
    const queryLower = betQuery.toLowerCase();
    
    // Check if this looks like a player prop - try to find team from player name
    const isLikelyProp = queryLower.includes('over') || queryLower.includes('under') || 
                         queryLower.includes('points') || queryLower.includes('rebounds') ||
                         queryLower.includes('assists') || queryLower.includes('threes') ||
                         queryLower.includes('+') || queryLower.includes('o/u');
    
    // Try to extract team from player name
    let playerTeams: string[] = [];
    for (const [playerKey, teams] of Object.entries(PLAYER_TEAM_MAP)) {
      if (queryLower.includes(playerKey)) {
        playerTeams = teams;
        console.log(`[ODDS] Found player mapping: ${playerKey} -> ${teams.join(', ')}`);
        break;
      }
    }

    // Find matching game
    const matchingGame = oddsData.find((game: any) => {
      const homeTeam = game.home_team?.toLowerCase() || '';
      const awayTeam = game.away_team?.toLowerCase() || '';
      const homeMascot = homeTeam.split(' ').pop() || '';
      const awayMascot = awayTeam.split(' ').pop() || '';
      
      // Direct team name match
      if (queryLower.includes(homeMascot) || queryLower.includes(awayMascot) ||
          homeTeam.includes(queryLower.split(' ')[0]) || awayTeam.includes(queryLower.split(' ')[0])) {
        return true;
      }
      
      // Player name to team match
      if (playerTeams.length > 0) {
        for (const team of playerTeams) {
          if (homeMascot.includes(team) || awayMascot.includes(team) ||
              homeTeam.includes(team) || awayTeam.includes(team)) {
            console.log(`[ODDS] Matched game via player: ${game.away_team} @ ${game.home_team}`);
            return true;
          }
        }
      }
      
      return false;
    });
    
    if (!matchingGame) {
      return { found: false };
    }
    
    const result: OddsSearchResult = {
      found: true,
      game: `${matchingGame.away_team} @ ${matchingGame.home_team}`,
      eventId: matchingGame.id,
      homeTeam: matchingGame.home_team,
      awayTeam: matchingGame.away_team,
      commenceTime: matchingGame.commence_time,
      bookmakers: [],
      currentSpread: [],
      currentTotal: [],
      currentML: []
    };
    
    // Extract odds from bookmakers
    for (const bookmaker of matchingGame.bookmakers || []) {
      result.bookmakers!.push(bookmaker.key);
      
      for (const market of bookmaker.markets || []) {
        if (market.key === 'spreads') {
          for (const outcome of market.outcomes || []) {
            result.currentSpread!.push({
              team: outcome.name,
              points: outcome.point,
              price: outcome.price
            });
          }
        } else if (market.key === 'totals') {
          for (const outcome of market.outcomes || []) {
            result.currentTotal!.push({
              type: outcome.name, // Over/Under
              points: outcome.point,
              price: outcome.price
            });
          }
        } else if (market.key === 'h2h') {
          for (const outcome of market.outcomes || []) {
            result.currentML!.push({
              team: outcome.name,
              price: outcome.price
            });
          }
        }
      }
    }
    
    // Check if this is a prop bet - try to fetch player props
    const propMarkets = ['player_points', 'player_rebounds', 'player_assists', 'player_threes', 'player_points_rebounds_assists'];
    const hasPlayerName = Object.keys(PLAYER_TEAM_MAP).some(p => queryLower.includes(p));
    const hasPropKeywords = queryLower.includes('over') || queryLower.includes('under') || 
                            queryLower.includes('points') || queryLower.includes('rebounds') ||
                            queryLower.includes('assists') || queryLower.includes('threes') ||
                            queryLower.includes('+') || queryLower.includes('o/u');
    
    if ((hasPlayerName || hasPropKeywords) && result.eventId) {
      try {
        // Determine which prop market to fetch
        let propMarket = 'player_points';
        if (queryLower.includes('rebound')) propMarket = 'player_rebounds';
        else if (queryLower.includes('assist')) propMarket = 'player_assists';
        else if (queryLower.includes('three') || queryLower.includes('3pt')) propMarket = 'player_threes';
        else if (queryLower.includes('pra') || queryLower.includes('pts+reb+ast')) propMarket = 'player_points_rebounds_assists';
        
        const propsData = await fetchPlayerProps(result.eventId, propMarket);
        result.playerProps = [];
        
        for (const bookmaker of propsData?.bookmakers || []) {
          for (const market of bookmaker.markets || []) {
            for (const outcome of market.outcomes || []) {
              if (outcome.description) {
                const existing = result.playerProps.find(p => 
                  p.player === outcome.description && p.line === outcome.point
                );
                if (!existing) {
                  result.playerProps.push({
                    player: outcome.description,
                    market: market.key,
                    line: outcome.point,
                    overPrice: outcome.name === 'Over' ? outcome.price : 0,
                    underPrice: outcome.name === 'Under' ? outcome.price : 0
                  });
                } else {
                  if (outcome.name === 'Over') existing.overPrice = outcome.price;
                  if (outcome.name === 'Under') existing.underPrice = outcome.price;
                }
              }
            }
          }
        }
      } catch (e) {
        console.log('[ODDS] Could not fetch player props:', e);
      }
    }
    
    return result;
  } catch (error) {
    console.error('[ODDS] Search error:', error);
    return { found: false };
  }
}

// Format odds data for AI context
export function formatOddsForPrompt(odds: OddsSearchResult): string {
  if (!odds.found) {
    return 'No odds data found for this bet from The Odds API.';
  }
  
  let output = `\n📊 LIVE ODDS DATA FROM THE ODDS API:\n`;
  output += `Game: ${odds.game}\n`;
  output += `Start: ${odds.commenceTime ? new Date(odds.commenceTime).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }) + ' PT' : 'TBD'}\n`;
  output += `Bookmakers: ${odds.bookmakers?.slice(0, 3).join(', ') || 'N/A'}\n\n`;
  
  if (odds.currentSpread && odds.currentSpread.length > 0) {
    output += `SPREADS:\n`;
    // Group by team and average
    const spreadMap = new Map<string, number[]>();
    for (const s of odds.currentSpread) {
      if (!spreadMap.has(s.team)) spreadMap.set(s.team, []);
      spreadMap.get(s.team)!.push(s.points);
    }
    for (const [team, points] of spreadMap) {
      const avg = points.reduce((a, b) => a + b, 0) / points.length;
      output += `  ${team}: ${avg > 0 ? '+' : ''}${avg.toFixed(1)}\n`;
    }
    output += '\n';
  }
  
  if (odds.currentTotal && odds.currentTotal.length > 0) {
    const totals = odds.currentTotal.filter(t => t.type === 'Over');
    if (totals.length > 0) {
      const avg = totals.reduce((a, b) => a + b.points, 0) / totals.length;
      output += `TOTAL: ${avg.toFixed(1)}\n\n`;
    }
  }
  
  if (odds.currentML && odds.currentML.length > 0) {
    output += `MONEYLINE:\n`;
    const mlMap = new Map<string, number[]>();
    for (const m of odds.currentML) {
      if (!mlMap.has(m.team)) mlMap.set(m.team, []);
      mlMap.get(m.team)!.push(m.price);
    }
    for (const [team, prices] of mlMap) {
      const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
      output += `  ${team}: ${avg > 0 ? '+' : ''}${avg}\n`;
    }
    output += '\n';
  }
  
  if (odds.playerProps && odds.playerProps.length > 0) {
    output += `PLAYER PROPS:\n`;
    for (const prop of odds.playerProps.slice(0, 10)) {
      output += `  ${prop.player}: ${prop.line} (O ${prop.overPrice > 0 ? '+' : ''}${prop.overPrice} / U ${prop.underPrice > 0 ? '+' : ''}${prop.underPrice})\n`;
    }
  }
  
  return output;
}
