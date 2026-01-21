import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../../data/watchlist.db");

// Ensure data directory exists
import fs from "fs";
const dataDir = path.join(__dirname, "../../data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS watched_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    
    -- Bet details
    bet_type TEXT NOT NULL, -- 'game' | 'prop' | 'parlay'
    game TEXT NOT NULL,
    pick TEXT NOT NULL,
    line TEXT NOT NULL,
    original_odds TEXT,
    current_odds TEXT,
    
    -- Analysis stored for context
    analysis TEXT,
    
    -- Status tracking
    status TEXT DEFAULT 'watching', -- 'watching' | 'won' | 'lost' | 'push' | 'cancelled'
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    game_time TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );
  
  CREATE INDEX IF NOT EXISTS idx_user_status ON watched_bets(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_guild_status ON watched_bets(guild_id, status);
`);

export interface WatchedBet {
  id: number;
  user_id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  bet_type: 'game' | 'prop' | 'parlay';
  game: string;
  pick: string;
  line: string;
  original_odds: string | null;
  current_odds: string | null;
  analysis: string | null;
  status: 'watching' | 'won' | 'lost' | 'push' | 'cancelled';
  created_at: string;
  game_time: string | null;
  updated_at: string;
  resolved_at: string | null;
}

// Add a bet to watchlist
export function addWatchedBet(bet: Omit<WatchedBet, 'id' | 'created_at' | 'updated_at' | 'resolved_at' | 'status'>): number {
  const stmt = db.prepare(`
    INSERT INTO watched_bets (user_id, guild_id, channel_id, message_id, bet_type, game, pick, line, original_odds, current_odds, analysis, game_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    bet.user_id,
    bet.guild_id,
    bet.channel_id,
    bet.message_id,
    bet.bet_type,
    bet.game,
    bet.pick,
    bet.line,
    bet.original_odds,
    bet.current_odds,
    bet.analysis,
    bet.game_time
  );
  console.log('[WATCHLIST] Added bet:', bet.game, bet.pick);
  return result.lastInsertRowid as number;
}

// Get all watching bets for a user
export function getUserWatchlist(userId: string): WatchedBet[] {
  const stmt = db.prepare(`SELECT * FROM watched_bets WHERE user_id = ? AND status = 'watching' ORDER BY created_at DESC`);
  return stmt.all(userId) as WatchedBet[];
}

// Get all watching bets (for background updates)
export function getAllWatchingBets(): WatchedBet[] {
  const stmt = db.prepare(`SELECT * FROM watched_bets WHERE status = 'watching'`);
  return stmt.all() as WatchedBet[];
}

// Get bets by guild
export function getGuildWatchlist(guildId: string): WatchedBet[] {
  const stmt = db.prepare(`SELECT * FROM watched_bets WHERE guild_id = ? AND status = 'watching' ORDER BY created_at DESC`);
  return stmt.all(guildId) as WatchedBet[];
}

// Update bet status
export function updateBetStatus(id: number, status: WatchedBet['status']): void {
  const stmt = db.prepare(`
    UPDATE watched_bets 
    SET status = ?, updated_at = CURRENT_TIMESTAMP, resolved_at = CASE WHEN ? != 'watching' THEN CURRENT_TIMESTAMP ELSE NULL END
    WHERE id = ?
  `);
  stmt.run(status, status, id);
  console.log('[WATCHLIST] Updated bet', id, 'to status:', status);
}

// Update current odds
export function updateBetOdds(id: number, currentOdds: string): void {
  const stmt = db.prepare(`UPDATE watched_bets SET current_odds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
  stmt.run(currentOdds, id);
}

// Remove a bet
export function removeBet(id: number, userId: string): boolean {
  const stmt = db.prepare(`DELETE FROM watched_bets WHERE id = ? AND user_id = ?`);
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

// Clear all user's watching bets
export function clearUserWatchlist(userId: string): number {
  const stmt = db.prepare(`DELETE FROM watched_bets WHERE user_id = ? AND status = 'watching'`);
  const result = stmt.run(userId);
  return result.changes;
}

// Get bet by ID
export function getBetById(id: number): WatchedBet | undefined {
  const stmt = db.prepare(`SELECT * FROM watched_bets WHERE id = ?`);
  return stmt.get(id) as WatchedBet | undefined;
}

// Get user's bet history (resolved bets)
export function getUserBetHistory(userId: string, limit = 20): WatchedBet[] {
  const stmt = db.prepare(`
    SELECT * FROM watched_bets 
    WHERE user_id = ? AND status != 'watching' 
    ORDER BY resolved_at DESC 
    LIMIT ?
  `);
  return stmt.all(userId, limit) as WatchedBet[];
}

// Store current slate data for button interactions
let currentSlateData: any = null;

export function setCurrentSlate(data: any): void {
  currentSlateData = data;
}

export function getCurrentSlate(): any {
  return currentSlateData;
}

export default db;
