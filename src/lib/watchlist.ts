import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { ENV } from "./env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lazy DB initialization - only create when actually needed (not during build)
let _db: Database.Database | null = null;
let _initialized = false;

function getDataDir(): string {
  return path.isAbsolute(ENV.DATA_DIR) 
    ? ENV.DATA_DIR 
    : path.join(__dirname, "../..", ENV.DATA_DIR);
}

function getDb(): Database.Database {
  if (!_db) {
    const dataDir = getDataDir();
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const dbPath = path.join(dataDir, "watchlist.db");
    console.log('[DB] Watchlist database path:', dbPath);
    _db = new Database(dbPath);
    
    // Initialize tables on first access
    if (!_initialized) {
      initTables();
      _initialized = true;
    }
  }
  return _db;
}

// Shorthand for queries
const db = new Proxy({} as Database.Database, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// Initialize tables (called lazily on first DB access)
function initTables() {
  getDb().exec(`
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
  
  -- Archive table for resolved bets (permanent history)
  CREATE TABLE IF NOT EXISTS archived_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    
    -- Bet details
    bet_type TEXT NOT NULL,
    game TEXT NOT NULL,
    pick TEXT NOT NULL,
    
    -- Line tracking
    original_line TEXT,
    final_line TEXT,
    line_movement TEXT, -- e.g., "-3.5 → -4.5"
    
    -- Final game data
    final_score TEXT,
    
    -- Outcome
    outcome TEXT NOT NULL, -- 'won' | 'lost' | 'push' | 'cancelled'
    
    -- Analysis & notes
    analysis TEXT,
    
    -- Timestamps
    placed_at DATETIME NOT NULL,
    resolved_at DATETIME NOT NULL,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_archive_user ON archived_bets(user_id);
  CREATE INDEX IF NOT EXISTS idx_archive_outcome ON archived_bets(user_id, outcome);
  CREATE INDEX IF NOT EXISTS idx_archive_date ON archived_bets(resolved_at);
  
  -- User config table for notification preferences
  CREATE TABLE IF NOT EXISTS user_config (
    user_id TEXT PRIMARY KEY,
    notifications_enabled INTEGER DEFAULT 1,
    line_movement_alerts INTEGER DEFAULT 1,
    movement_threshold REAL DEFAULT 0.5,
    polling_interval INTEGER DEFAULT 30,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
  console.log('[DB] Watchlist tables initialized');
}

export interface UserConfig {
  user_id: string;
  notifications_enabled: boolean;
  line_movement_alerts: boolean;
  movement_threshold: number;
  polling_interval: number; // in minutes
}

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

export interface ArchivedBet {
  id: number;
  original_id: number;
  user_id: string;
  guild_id: string;
  channel_id: string;
  bet_type: 'game' | 'prop' | 'parlay';
  game: string;
  pick: string;
  original_line: string | null;
  final_line: string | null;
  line_movement: string | null;
  final_score: string | null;
  outcome: 'won' | 'lost' | 'push' | 'cancelled';
  analysis: string | null;
  placed_at: string;
  resolved_at: string;
  archived_at: string;
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

// ==================== ARCHIVE FUNCTIONS ====================

// Archive a resolved bet and remove from active table
export function archiveBet(
  betId: number, 
  outcome: ArchivedBet['outcome'],
  finalLine?: string,
  finalScore?: string
): boolean {
  const bet = getBetById(betId);
  if (!bet) return false;
  
  const lineMovement = bet.original_odds && finalLine && bet.original_odds !== finalLine
    ? `${bet.original_odds} → ${finalLine}`
    : null;
  
  const insertStmt = db.prepare(`
    INSERT INTO archived_bets (
      original_id, user_id, guild_id, channel_id,
      bet_type, game, pick,
      original_line, final_line, line_movement, final_score,
      outcome, analysis,
      placed_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  
  const deleteStmt = db.prepare(`DELETE FROM watched_bets WHERE id = ?`);
  
  // Transaction: insert to archive, delete from active
  const transaction = db.transaction(() => {
    insertStmt.run(
      bet.id,
      bet.user_id,
      bet.guild_id,
      bet.channel_id,
      bet.bet_type,
      bet.game,
      bet.pick,
      bet.original_odds || bet.line,
      finalLine || bet.current_odds || bet.line,
      lineMovement,
      finalScore,
      outcome,
      bet.analysis,
      bet.created_at
    );
    deleteStmt.run(betId);
  });
  
  try {
    transaction();
    console.log(`[ARCHIVE] Bet #${betId} archived as ${outcome}`);
    return true;
  } catch (error) {
    console.error(`[ARCHIVE] Failed to archive bet #${betId}:`, error);
    return false;
  }
}

// Get user's archived bet history
export function getUserArchive(userId: string, limit = 50): ArchivedBet[] {
  const stmt = db.prepare(`
    SELECT * FROM archived_bets 
    WHERE user_id = ? 
    ORDER BY resolved_at DESC 
    LIMIT ?
  `);
  return stmt.all(userId, limit) as ArchivedBet[];
}

// Get user's archive stats
export function getUserStats(userId: string): {
  total: number;
  won: number;
  lost: number;
  push: number;
  cancelled: number;
  winRate: number;
  roi?: number;
} {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN outcome = 'won' THEN 1 ELSE 0 END) as won,
      SUM(CASE WHEN outcome = 'lost' THEN 1 ELSE 0 END) as lost,
      SUM(CASE WHEN outcome = 'push' THEN 1 ELSE 0 END) as push,
      SUM(CASE WHEN outcome = 'cancelled' THEN 1 ELSE 0 END) as cancelled
    FROM archived_bets WHERE user_id = ?
  `);
  const row = stmt.get(userId) as any;
  
  const total = row?.total || 0;
  const won = row?.won || 0;
  const lost = row?.lost || 0;
  const push = row?.push || 0;
  const cancelled = row?.cancelled || 0;
  const decided = won + lost;
  
  return {
    total,
    won,
    lost,
    push,
    cancelled,
    winRate: decided > 0 ? (won / decided) * 100 : 0
  };
}

// Archive all resolved bets older than X hours (cleanup job)
export function archiveOldResolvedBets(hoursOld = 24): number {
  const stmt = db.prepare(`
    SELECT * FROM watched_bets 
    WHERE status != 'watching' 
    AND resolved_at < datetime('now', '-' || ? || ' hours')
  `);
  const oldBets = stmt.all(hoursOld) as WatchedBet[];
  
  let archived = 0;
  for (const bet of oldBets) {
    if (archiveBet(bet.id, bet.status as ArchivedBet['outcome'])) {
      archived++;
    }
  }
  
  if (archived > 0) {
    console.log(`[ARCHIVE] Cleaned up ${archived} old resolved bet(s)`);
  }
  return archived;
}

// Get bets that need resolution check (game should be over)
export function getBetsNeedingResolution(): WatchedBet[] {
  // Get bets that have been watching for more than 4 hours (game likely over)
  const stmt = db.prepare(`
    SELECT * FROM watched_bets 
    WHERE status = 'watching' 
    AND created_at < datetime('now', '-4 hours')
  `);
  return stmt.all() as WatchedBet[];
}

// Store current slate data for button interactions
let currentSlateData: any = null;
let lastPolledTime: Date | null = null;

export function setCurrentSlate(data: any): void {
  currentSlateData = data;
}

export function getCurrentSlate(): any {
  return currentSlateData;
}

export function setLastPolled(time: Date): void {
  lastPolledTime = time;
}

export function getLastPolled(): Date | null {
  return lastPolledTime;
}

// Get comprehensive state stats for /state command
export function getStateStats(): {
  watchedBets: number;
  archivedBets: number;
  uniqueUsers: number;
  resolvedBets: number;
  wonBets: number;
  lostBets: number;
  pushBets: number;
  winRate: string;
} {
  const watched = db.prepare(`SELECT COUNT(*) as count FROM watched_bets WHERE status = 'watching'`).get() as any;
  const archived = db.prepare(`SELECT COUNT(*) as count FROM archived_bets`).get() as any;
  const users = db.prepare(`SELECT COUNT(DISTINCT user_id) as count FROM watched_bets`).get() as any;
  const resolved = db.prepare(`SELECT COUNT(*) as count FROM watched_bets WHERE status != 'watching'`).get() as any;
  
  // Get outcome counts from both tables
  const wonWatched = db.prepare(`SELECT COUNT(*) as count FROM watched_bets WHERE status = 'won'`).get() as any;
  const lostWatched = db.prepare(`SELECT COUNT(*) as count FROM watched_bets WHERE status = 'lost'`).get() as any;
  const pushWatched = db.prepare(`SELECT COUNT(*) as count FROM watched_bets WHERE status = 'push'`).get() as any;
  
  const wonArchived = db.prepare(`SELECT COUNT(*) as count FROM archived_bets WHERE outcome = 'won'`).get() as any;
  const lostArchived = db.prepare(`SELECT COUNT(*) as count FROM archived_bets WHERE outcome = 'lost'`).get() as any;
  const pushArchived = db.prepare(`SELECT COUNT(*) as count FROM archived_bets WHERE outcome = 'push'`).get() as any;
  
  const won = (wonWatched?.count || 0) + (wonArchived?.count || 0);
  const lost = (lostWatched?.count || 0) + (lostArchived?.count || 0);
  const push = (pushWatched?.count || 0) + (pushArchived?.count || 0);
  
  const total = won + lost;
  const winRate = total > 0 ? ((won / total) * 100).toFixed(1) : '0.0';
  
  return {
    watchedBets: watched?.count || 0,
    archivedBets: archived?.count || 0,
    uniqueUsers: users?.count || 0,
    resolvedBets: (resolved?.count || 0) + (archived?.count || 0),
    wonBets: won,
    lostBets: lost,
    pushBets: push,
    winRate
  };
}

// Get user config (with defaults)
export function getConfig(userId: string): UserConfig {
  const row = db.prepare(`SELECT * FROM user_config WHERE user_id = ?`).get(userId) as any;
  
  if (!row) {
    return {
      user_id: userId,
      notifications_enabled: true,
      line_movement_alerts: true,
      movement_threshold: 0.5,
      polling_interval: 30
    };
  }
  
  return {
    user_id: row.user_id,
    notifications_enabled: !!row.notifications_enabled,
    line_movement_alerts: !!row.line_movement_alerts,
    movement_threshold: row.movement_threshold || 0.5,
    polling_interval: row.polling_interval || 30
  };
}

// Update user config
export function setConfig(userId: string, updates: Partial<Omit<UserConfig, 'user_id'>>): void {
  const existing = db.prepare(`SELECT * FROM user_config WHERE user_id = ?`).get(userId);
  
  if (!existing) {
    // Insert new config
    db.prepare(`
      INSERT INTO user_config (user_id, notifications_enabled, line_movement_alerts, movement_threshold, polling_interval)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      userId,
      updates.notifications_enabled !== undefined ? (updates.notifications_enabled ? 1 : 0) : 1,
      updates.line_movement_alerts !== undefined ? (updates.line_movement_alerts ? 1 : 0) : 1,
      updates.movement_threshold !== undefined ? updates.movement_threshold : 0.5,
      updates.polling_interval !== undefined ? updates.polling_interval : 30
    );
  } else {
    // Update existing
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.notifications_enabled !== undefined) {
      fields.push('notifications_enabled = ?');
      values.push(updates.notifications_enabled ? 1 : 0);
    }
    if (updates.line_movement_alerts !== undefined) {
      fields.push('line_movement_alerts = ?');
      values.push(updates.line_movement_alerts ? 1 : 0);
    }
    if (updates.movement_threshold !== undefined) {
      fields.push('movement_threshold = ?');
      values.push(updates.movement_threshold);
    }
    if (updates.polling_interval !== undefined) {
      fields.push('polling_interval = ?');
      values.push(updates.polling_interval);
    }
    
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);
      
      db.prepare(`UPDATE user_config SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
    }
  }
  
  console.log('[CONFIG] Updated config for', userId, updates);
}

export default db;
