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
    
    const dbPath = path.join(dataDir, "slate_cache.db");
    console.log('[DB] Slate cache database path:', dbPath);
    _db = new Database(dbPath);
    
    // Initialize tables on first access
    if (!_initialized) {
      initCacheTable();
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

// Initialize cache table (called lazily on first DB access)
function initCacheTable() {
  getDb().exec(`
  CREATE TABLE IF NOT EXISTS slate_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    date TEXT NOT NULL,
    slate_json TEXT NOT NULL,
    raw_output TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    sources TEXT
  )
`);
  console.log('[DB] Slate cache table initialized');
}

export interface CachedSlate {
  date: string;
  slateJson: any;
  rawOutput: string;
  generatedAt: Date;
  sources: string[];
}

// Cache duration in milliseconds (2 hours by default)
const CACHE_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Get cached slate if it exists and is still valid
 */
export function getCachedSlate(): CachedSlate | null {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  
  const row = db.prepare(`
    SELECT date, slate_json, raw_output, generated_at, sources 
    FROM slate_cache WHERE id = 1
  `).get() as any;
  
  if (!row) {
    console.log('[CACHE] No cached slate found');
    return null;
  }
  
  // Check if cache is for today
  if (row.date !== today) {
    console.log('[CACHE] Cached slate is for different day:', row.date, 'vs', today);
    return null;
  }
  
  // Check if cache has expired
  const generatedAt = new Date(row.generated_at);
  const age = Date.now() - generatedAt.getTime();
  
  if (age > CACHE_DURATION_MS) {
    console.log('[CACHE] Cached slate expired, age:', Math.round(age / 60000), 'minutes');
    return null;
  }
  
  console.log('[CACHE] ✅ Valid cached slate found, age:', Math.round(age / 60000), 'minutes');
  
  return {
    date: row.date,
    slateJson: JSON.parse(row.slate_json),
    rawOutput: row.raw_output,
    generatedAt,
    sources: row.sources ? JSON.parse(row.sources) : []
  };
}

/**
 * Save slate to cache
 */
export function saveSlateToCache(slateJson: any, rawOutput: string, sources: string[] = []): void {
  const today = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  
  db.prepare(`
    INSERT OR REPLACE INTO slate_cache (id, date, slate_json, raw_output, generated_at, sources)
    VALUES (1, ?, ?, ?, ?, ?)
  `).run(
    today,
    JSON.stringify(slateJson),
    rawOutput,
    new Date().toISOString(),
    JSON.stringify(sources)
  );
  
  console.log('[CACHE] ✅ Slate cached for', today);
}

/**
 * Clear the cache (force refresh)
 */
export function clearSlateCache(): void {
  db.prepare(`DELETE FROM slate_cache WHERE id = 1`).run();
  console.log('[CACHE] 🗑️ Cache cleared');
}

/**
 * Get cache age in minutes (for display)
 */
export function getCacheAgeMinutes(): number | null {
  const row = db.prepare(`
    SELECT generated_at FROM slate_cache WHERE id = 1
  `).get() as any;
  
  if (!row) return null;
  
  const generatedAt = new Date(row.generated_at);
  return Math.round((Date.now() - generatedAt.getTime()) / 60000);
}
