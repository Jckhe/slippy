# Commands Reference

## `/slate`

Generate today's NBA betting picks with AI-powered analysis.

### Usage
```
/slate [style]
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `style` | string | No | Display format: `compact` (default), `card`, or `bullet` |

### Display Styles

**Compact** (default) - Confidence bars
```
┌─────────────────────────────
│ 📊 OKC -9.5 | O/U 226.0
│ 🎯 Pick: Thunder -9.5
│ 🔥 Confidence: ████████░░ 80%
└─────────────────────────────
Thunder are 8-2 ATS as road favorites...
```

**Card** - Boxed format
```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 📈 OKC -9.5  │  ⚖️ O/U 226.0
┃ ✅ PICK: Thunder -9.5
┃ 🔥🔥🔥🔥 HIGH CONFIDENCE
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
• Thunder are 8-2 ATS
• Bucks without Middleton
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

**Bullet** - Clean minimal
```
──────────────────────
📊 OKC -9.5 | O/U 226.0 | 🎯 Thunder -9.5

✓ Thunder are 8-2 ATS as road favorites
✓ Bucks without Middleton tonight
```

### Output Sections

1. **Games** - Spread/total picks ranked by value
2. **Props** - Player props (points, rebounds, etc.)
3. **Parlays** - 2-3 leg parlay suggestions
4. **Injuries** - Key injury report

### Interactive Features

After the slate is generated:
- Click **"Track Bets"** button to add picks to your watchlist
- Select specific games/props from dropdown menus

---

## `/ask`

Ask any NBA betting question. Uses today's slate as context if available.

### Usage
```
/ask question:<your question>
```

### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `question` | string | Yes | Your question about NBA betting |

### Example Questions

```
/ask question:Is Thunder -9.5 a good bet tonight?
/ask question:What's Shai's scoring average vs Milwaukee?
/ask question:Should I parlay Celtics and Thunder?
/ask question:Who's out for Cleveland tonight?
```

### Features

- Automatically includes today's slate context if `/slate` was run
- Uses OpenAI Responses API (without web search for faster responses)
- Truncates responses to Discord's 2000 character limit

---

## `/watchlist`

Manage your tracked bets and view betting history.

### Subcommands

#### `/watchlist view`

View all your currently watching bets.

```
/watchlist view
```

Shows:
- Bet ID, game, pick, line
- Line movement (if changed)
- Game time
- Dropdown to remove bets

---

#### `/watchlist history`

View your resolved bets and win rate.

```
/watchlist history
```

Shows:
- All resolved bets with status (✅ Won, ❌ Lost, ➖ Push)
- Record: W-L-P
- Win rate percentage

---

#### `/watchlist clear`

Remove all watching bets from your watchlist.

```
/watchlist clear
```

---

#### `/watchlist resolve`

Manually mark a bet as won, lost, push, or cancelled.

```
/watchlist resolve id:<bet_id> outcome:<result>
```

| Option | Type | Required | Values |
|--------|------|----------|--------|
| `id` | integer | Yes | Bet ID number |
| `outcome` | string | Yes | `won`, `lost`, `push`, `cancelled` |

### Bet Tracking Flow

```
1. Run /slate to generate picks
2. Click "Track Bets" button
3. Select games/props to track
4. Bot monitors odds changes (every 30 min)
5. Auto-resolves when games finish
   (or manually resolve with /watchlist resolve)
6. View history with /watchlist history
```

---

## Command Registration

Commands are registered via `deploy-commands.ts`:

```bash
npm run deploy
```

This pushes slash command definitions to Discord's API.
