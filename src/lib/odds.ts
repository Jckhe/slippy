import { ENV } from "./env.js";

export async function fetchOdds() {
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
    console.log('[ODDS] Response headers:', JSON.stringify(Object.fromEntries(r.headers.entries()), null, 2));
    
    if (!r.ok) {
      const errorBody = await r.text();
      console.error('[ODDS] ❌ API Error Response Body:', errorBody);
      throw new Error(`Odds API error (${r.status} ${r.statusText}): ${errorBody}`);
    }
    
    const data = await r.json();
    console.log('[ODDS] ✅ Got', data?.length || 0, 'games');
    if (data?.length > 0) {
      console.log('[ODDS] First game preview:', JSON.stringify(data[0]).substring(0, 200) + '...');
    }
    return data;
  } catch (error) {
    console.error('[ODDS] ❌ Fetch error:', error);
    throw error;
  }
}
