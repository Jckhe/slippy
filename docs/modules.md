# Modules Guide

## Library Modules (`src/lib/`)

### `env.ts`

Environment configuration loader.

```typescript
import { ENV } from "./lib/env.js";

ENV.DISCORD_TOKEN    // Discord bot token
ENV.OPENAI_API_KEY   // OpenAI API key
ENV.OPENAI_MODEL     // Model name (e.g., "gpt-4o")
ENV.ODDS_API_KEY     // The Odds API key
ENV.ODDS_REGIONS     // Betting regions (e.g., "us")
ENV.ODDS_MARKETS     // Markets (spreads, totals, h2h)
ENV.ODDS_BOOKMAKERS  // Sportsbooks to query
```

---

### `openai.ts`

OpenAI Responses API wrapper with polling.

```typescript
import { openai, waitForResponse } from "./lib/openai.js";

// Create a response (optionally with web search)
const created = await openai.responses.create({
  model: ENV.OPENAI_MODEL,
  input: "Your prompt here",
  tools: [{ type: "web_search_preview" }]  // optional
});

// Poll until complete (with optional timeout)
const response = await waitForResponse(created.id, timeoutMs);

// Extract text from response
response.output_text  // Simplified text output
```

**Key Functions:**
| Function | Description |
|----------|-------------|
| `openai.responses.create()` | Create async response |
| `waitForResponse(id, timeout?)` | Poll until complete |

---

### `odds.ts`

The Odds API client for fetching live betting lines.

```typescript
import { fetchOdds } from "./lib/odds.js";

const games = await fetchOdds();
// Returns array of games with odds from configured bookmakers
```

**API Response Structure:**
```json
{
  "id": "abc123",
  "sport_key": "basketball_nba",
  "home_team": "Milwaukee Bucks",
  "away_team": "Oklahoma City Thunder",
  "bookmakers": [
    {
      "key": "fanduel",
      "markets": [
        { "key": "spreads", "outcomes": [...] },
        { "key": "totals", "outcomes": [...] }
      ]
    }
  ]
}
```

---

### `oddsChecker.ts`

Background service that monitors watched bets for:
- Line movement (odds changes)
- Game completion (auto-resolution)

```typescript
import { startOddsChecker, stopOddsChecker } from "./lib/oddsChecker.js";

// Start checking every 30 minutes
startOddsChecker(discordClient, 30);

// Stop the checker
stopOddsChecker();
```

**Process:**
1. Get all bets with `status = 'watching'`
2. Group bets by game (minimize API calls)
3. Query OpenAI with web search for game status
4. Update odds if changed
5. Auto-resolve if game is final
6. Send DM notifications for significant changes

---

### `store.ts`

In-memory cache for the current day's slate.

```typescript
import { saveSlate, getSlate, getSlateContext } from "./lib/store.js";

// Save slate after /slate command
saveSlate(jsonContent);

// Get slate data (returns null if >24h old)
const slate = getSlate();
// { date: "Monday, January 20, 2026", content: "...", timestamp: 123 }

// Get formatted context for /ask prompts
const context = getSlateContext();
// "\n\nCURRENT SLATE (Monday, January 20, 2026):\n..."
```

**TTL:** 24 hours (slate auto-expires)

---

### `watchlist.ts`

SQLite database for persistent bet tracking.

```typescript
import {
  addWatchedBet,
  getUserWatchlist,
  getUserBetHistory,
  updateBetStatus,
  updateBetOdds,
  removeBet,
  clearUserWatchlist,
  getAllWatchingBets
} from "./lib/watchlist.js";
```

**Database Schema:**
```sql
CREATE TABLE watched_bets (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  guild_id TEXT,
  channel_id TEXT,
  message_id TEXT,
  
  bet_type TEXT,      -- 'game' | 'prop' | 'parlay'
  game TEXT,          -- "Thunder @ Bucks"
  pick TEXT,          -- "Thunder -9.5"
  line TEXT,          -- "-9.5"
  original_odds TEXT,
  current_odds TEXT,
  analysis TEXT,
  
  status TEXT,        -- 'watching' | 'won' | 'lost' | 'push' | 'cancelled'
  created_at DATETIME,
  game_time TEXT,
  updated_at DATETIME,
  resolved_at DATETIME
);
```

**Key Functions:**

| Function | Description |
|----------|-------------|
| `addWatchedBet(bet)` | Add new bet, returns ID |
| `getUserWatchlist(userId)` | Get user's watching bets |
| `getUserBetHistory(userId)` | Get user's resolved bets |
| `updateBetStatus(id, status)` | Mark won/lost/push |
| `updateBetOdds(id, newOdds)` | Update current odds |
| `removeBet(id, userId)` | Delete a bet |
| `clearUserWatchlist(userId)` | Clear all watching bets |
| `getAllWatchingBets()` | Get all users' watching bets |
| `setCurrentSlate(data)` | Store parsed slate for tracking |
| `getCurrentSlate()` | Get parsed slate data |

---

### `interactions.ts`

Handles Discord button clicks and select menu selections.

```typescript
import { handleButton, handleSelectMenu } from "./lib/interactions.js";

// In index.ts:
if (interaction.isButton()) {
  await handleButton(interaction);
}
if (interaction.isStringSelectMenu()) {
  await handleSelectMenu(interaction);
}
```

**Button Handlers:**
| Custom ID | Handler | Action |
|-----------|---------|--------|
| `track_bets` | `handleTrackBetsButton()` | Show game/prop selection menus |
| `refresh_watchlist` | `handleRefreshWatchlist()` | Refresh watchlist embed |

**Select Menu Handlers:**
| Custom ID | Handler | Action |
|-----------|---------|--------|
| `track_games_select` | `handleTrackGamesSelect()` | Add selected games to watchlist |
| `track_props_select` | `handleTrackPropsSelect()` | Add selected props to watchlist |
| `watchlist_remove` | `handleWatchlistRemove()` | Remove selected bet |

---

## Data Directory

```
data/
└── watchlist.db    # SQLite database (auto-created)
```

The `data/` directory is created automatically when the bot first runs. The SQLite database persists bet tracking data across restarts.
