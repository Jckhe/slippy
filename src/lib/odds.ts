import { ENV } from "./env.js";

export async function fetchOdds() {
  const url =
    `https://api.the-odds-api.com/v4/sports/basketball_nba/odds` +
    `?regions=${ENV.ODDS_REGIONS}` +
    `&markets=${ENV.ODDS_MARKETS}` +
    `&bookmakers=${ENV.ODDS_BOOKMAKERS}` +
    `&oddsFormat=american` +
    `&apiKey=${ENV.ODDS_API_KEY}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("Odds API error");
  return r.json();
}
