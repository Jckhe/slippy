import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "../../data/slate_cache.db"));

// Create cache table
db.exec(`
  CREATE TABLE IF NOT EXISTS slate_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    date TEXT NOT NULL,
    slate_json TEXT NOT NULL,
    raw_output TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    sources TEXT
  )
`);

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
