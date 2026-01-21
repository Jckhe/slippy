# NBA Slate Bot Documentation

A Discord bot for NBA betting analysis, powered by OpenAI with web search capabilities.

## Quick Links

- [Architecture Overview](./architecture.md) - System design and data flow
- [Commands Reference](./commands.md) - All slash commands explained
- [Modules Guide](./modules.md) - Library modules and their functions

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js + TypeScript |
| Bot Framework | discord.js |
| AI | OpenAI Responses API (with web search) |
| Database | SQLite (better-sqlite3) |
| Odds Data | The Odds API |

## Project Structure

```
src/
├── index.ts              # Bot entry point
├── deploy-commands.ts    # Register slash commands
├── commands/
│   ├── slate.ts          # /slate - daily picks
│   ├── ask.ts            # /ask - Q&A assistant
│   └── watchlist.ts      # /watchlist - bet tracking
└── lib/
    ├── env.ts            # Environment config
    ├── openai.ts         # OpenAI client wrapper
    ├── odds.ts           # The Odds API client
    ├── oddsChecker.ts    # Background odds monitoring
    ├── store.ts          # In-memory slate cache
    ├── watchlist.ts      # SQLite watchlist DB
    └── interactions.ts   # Button/menu handlers
```

## Getting Started

1. Copy `.env.example` to `.env` and fill in your keys
2. Run `npm install`
3. Run `npm run deploy` to register commands
4. Run `npm start` to launch the bot
