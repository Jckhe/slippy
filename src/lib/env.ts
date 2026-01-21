import "dotenv/config";
export const ENV = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN!,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID!,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-5.2",
  ODDS_API_KEY: process.env.ODDS_API_KEY!,
  ODDS_REGIONS: process.env.ODDS_REGIONS ?? "us",
  ODDS_BOOKMAKERS: process.env.ODDS_BOOKMAKERS ?? "draftkings,fanduel",
  ODDS_MARKETS: process.env.ODDS_MARKETS ?? "h2h,spreads,totals",
  // Data directory for persistent storage (set to Render Disk mount path in production)
  DATA_DIR: process.env.DATA_DIR ?? "./data",
};
