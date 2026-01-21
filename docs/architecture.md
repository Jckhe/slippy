# Architecture Overview

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Discord Server                          │
│                                                                 │
│  User types /slate  ──────►  Bot receives interaction           │
│                                      │                          │
│                                      ▼                          │
│                              ┌──────────────┐                   │
│                              │   index.ts   │                   │
│                              │  (router)    │                   │
│                              └──────┬───────┘                   │
│                                     │                           │
│              ┌──────────────────────┼──────────────────────┐    │
│              ▼                      ▼                      ▼    │
│      ┌──────────────┐      ┌──────────────┐      ┌────────────┐ │
│      │  /slate      │      │  /ask        │      │ /watchlist │ │
│      │  command     │      │  command     │      │  command   │ │
│      └──────┬───────┘      └──────┬───────┘      └─────┬──────┘ │
│             │                     │                    │        │
└─────────────┼─────────────────────┼────────────────────┼────────┘
              │                     │                    │
              ▼                     ▼                    ▼
     ┌─────────────────┐   ┌─────────────────┐   ┌─────────────┐
     │   OpenAI API    │   │   OpenAI API    │   │   SQLite    │
     │  + Web Search   │   │   (no search)   │   │  Database   │
     └─────────────────┘   └─────────────────┘   └─────────────┘
```

## Core Components

### 1. Entry Point (`index.ts`)

The main bot file that:
- Creates Discord client with guild intents
- Registers command handlers (`slate`, `ask`, `watchlist`)
- Routes interactions (slash commands, buttons, select menus)
- Starts the background odds checker on ready

```
interactionCreate event
        │
        ├── isChatInputCommand() → route to command handler
        ├── isButton() → handleButton()
        └── isStringSelectMenu() → handleSelectMenu()
```

### 2. Command Flow

#### `/slate` Command
```
User runs /slate
       │
       ▼
   deferReply() (shows "thinking...")
       │
       ▼
   Build prompt with today's date
       │
       ▼
   OpenAI Responses API + web_search_preview
       │  (searches ESPN, OddsChecker, etc.)
       ▼
   Parse JSON response
       │
       ├── games[] → ranked game picks
       ├── props[] → player prop picks  
       ├── parlays[] → parlay suggestions
       └── injuries → key injury report
       │
       ▼
   Format output (compact/card/bullet style)
       │
       ▼
   Save to store + watchlist context
       │
       ▼
   Reply with embeds + "Track Bets" button
```

#### `/ask` Command
```
User runs /ask question:"Is Thunder a good bet?"
       │
       ▼
   deferReply()
       │
       ▼
   Get slate context from store (if available)
       │
       ▼
   OpenAI Responses API (no web search)
       │
       ▼
   Reply with answer (max 2000 chars)
```

#### `/watchlist` Command
```
User runs /watchlist view|history|clear|resolve
       │
       ├── view → Show current watching bets
       ├── history → Show resolved bets + win rate
       ├── clear → Remove all watching bets
       └── resolve → Manually mark bet result
```

### 3. Background Services

#### Odds Checker (`oddsChecker.ts`)
```
Bot starts
    │
    ▼
startOddsChecker(client, 30 minutes)
    │
    ▼
┌──────────────────────────────────┐
│  Every 30 minutes:               │
│  1. Get all watching bets        │
│  2. Group by game                │
│  3. For each game:               │
│     - Call OpenAI + web search   │
│     - Check game status          │
│     - Update odds if changed     │
│     - Auto-resolve if final      │
│  4. Notify users of changes      │
└──────────────────────────────────┘
```

## Data Flow

### Slate Generation → Watchlist

```
┌─────────────┐     save      ┌─────────────┐
│  /slate     │ ────────────► │   store.ts  │  (in-memory, 24h TTL)
│  response   │               │   slate     │
└──────┬──────┘               └─────────────┘
       │                              │
       │ setCurrentSlate()            │ getSlateContext()
       ▼                              ▼
┌─────────────────────────────────────────────┐
│              watchlist.ts                   │
│  ┌────────────────────────────────────────┐ │
│  │  watched_bets table (SQLite)           │ │
│  │  - user_id, game, pick, line           │ │
│  │  - original_odds, current_odds         │ │
│  │  - status: watching/won/lost/push      │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Interaction Flow (Buttons/Menus)

```
User clicks "Track Bets" button
       │
       ▼
interactions.ts → handleTrackBetsButton()
       │
       ▼
Show select menus for games/props
       │
       ▼
User selects bets to track
       │
       ▼
handleTrackGamesSelect() / handleTrackPropsSelect()
       │
       ▼
addWatchedBet() → SQLite
       │
       ▼
Reply with confirmation
```

## External Services

| Service | Purpose | Rate Limits |
|---------|---------|-------------|
| OpenAI Responses API | AI analysis + web search | Per-minute token limits |
| The Odds API | Real-time betting lines | 500 requests/month (free) |
| Discord API | Bot communication | 50 requests/second |
