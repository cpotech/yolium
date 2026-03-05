# Discord + Yolium Kanban Integration Plan

## Overview

Enable two-way sync between Yolium kanban boards and Discord, so teams can monitor agent progress, receive notifications, and interact with kanban items directly from Discord.

---

## Goals

1. **Visibility** — Surface agent activity (started, waiting, completed, failed) to Discord channels in real time
2. **Interaction** — Allow users to answer agent questions, add comments, and move items from Discord
3. **Collaboration** — Multiple team members can follow project progress without running Yolium locally
4. **Persistence** — Yolium remains the source of truth; Discord is a view + interaction layer

---

## Architecture

```
┌──────────────────────┐          ┌──────────────────────────┐
│  Yolium Desktop      │          │  Discord                 │
│                      │          │                          │
│  Kanban Store ───────┼── out ──►│  Channel messages        │
│  Agent Runner ───────┼── out ──►│  (embeds, threads)       │
│                      │          │                          │
│  IPC / Handlers ◄────┼── in ───┤  Webhook callbacks /     │
│                      │          │  Bot interactions        │
└──────────────────────┘          └──────────────────────────┘
```

Two integration modes (can be mixed):

| Mode | Direction | Complexity | Use Case |
|------|-----------|------------|----------|
| **Webhook (outbound)** | Yolium → Discord | Low | Notifications only — no Discord bot needed |
| **Bot (bidirectional)** | Yolium ↔ Discord | Medium | Full interaction — answer questions, add comments, move items |

---

## Phase 1: Outbound Webhooks (Notifications)

### What it does
Push kanban events to a Discord channel via webhooks. No bot required — just a webhook URL configured per project.

### Events to broadcast

| Event | Trigger | Embed content |
|-------|---------|---------------|
| Item created | `kanban:add-item` or `create_item` protocol msg | Title, description, column, assigned agent |
| Agent started | `agent:start` | Item title, agent type, branch |
| Agent waiting | `ask_question` protocol msg | Question text, answer options as buttons (display-only in Phase 1) |
| Agent completed | `complete` protocol msg | Summary, cost/tokens, moved-to column |
| Agent failed | `error` protocol msg | Error message, item link |
| Item moved | `kanban:update-item` (column change) | Item title, from → to column |
| Comment added | `kanban:add-comment` | Comment text, source (user/agent/system) |

### Implementation sketch

1. **Config**: Add `discordWebhookUrl` field to project settings (stored in kanban board or sidebar store)
2. **Service**: `src/main/services/discord-webhook.ts`
   - `sendDiscordEmbed(webhookUrl, embed)` — POST to Discord webhook API
   - Rate-limit aware (Discord allows 30 req/min per webhook)
   - Queue with retry on 429s
3. **Hook points**: Emit from `kanban-store.ts` mutation functions and `agent-runner.ts` protocol handler
4. **Embed formatting**: Rich embeds with color-coded status (green=complete, red=failed, yellow=waiting, blue=running)
5. **IPC**: `discord:set-webhook` / `discord:test-webhook` handlers
6. **UI**: Webhook URL field in project settings or kanban board settings

### New files
- `src/main/services/discord-webhook.ts` — Webhook client + message formatting
- `src/main/ipc/discord-handlers.ts` — IPC for config CRUD + test ping

---

## Phase 2: Discord Bot (Bidirectional)

### What it does
A lightweight Discord bot (runs inside Yolium's main process or as a sidecar) that lets users interact with kanban items from Discord.

### Interactions

| Discord action | Yolium effect |
|----------------|---------------|
| Click button on "agent waiting" message | Answer agent question, resume agent |
| `/yolium comment <item> <text>` | Add comment to kanban item |
| `/yolium move <item> <column>` | Move item to a different column |
| `/yolium status` | Show board summary (items per column, running agents) |
| `/yolium retry <item>` | Retry a failed agent |
| `/yolium items [column]` | List items, optionally filtered by column |
| React with ✅ on "completed" message | Move item to "done" column |

### Implementation sketch

1. **Bot token config**: Add Discord bot token + guild/channel ID to git-config store (encrypted like PAT)
2. **Bot client**: `src/main/services/discord-bot.ts`
   - Use `discord.js` library
   - Start/stop with app lifecycle
   - Register slash commands on connect
   - Message components (buttons) for agent question answers
3. **Item mapping**: Track Discord message ID ↔ kanban item ID so bot can update existing messages
4. **Thread per item** (optional): Create a Discord thread per kanban item for focused discussion
5. **Permissions**: Bot only responds in configured channels; validates user roles before mutations

### New files
- `src/main/services/discord-bot.ts` — Bot client, command handlers, button interactions
- `src/main/stores/discord-store.ts` — Message ID ↔ item ID mapping, bot config persistence

### New dependency
- `discord.js` (~500KB) — Official Discord API library

---

## Phase 3: Channel ↔ Board Mapping

### What it does
Map Discord channels to specific kanban boards and allow richer workflows.

### Features

1. **Multi-board support**: Different channels map to different project boards
2. **Thread-per-item**: Each kanban item gets a Discord thread; all comments sync bidirectionally
3. **Agent log streaming**: Option to stream agent output to a thread in real time (throttled)
4. **Board dashboard**: Pinned message in channel auto-updates with board summary (items per column, active agents)
5. **PR notifications**: When an agent creates a PR, post the PR link with approve/merge buttons (GitHub webhook bridge)

### Implementation sketch

1. **Channel registry**: `src/main/stores/discord-store.ts` maps `channelId → projectPath`
2. **Thread sync**: On item creation, create thread; on comment add, post to thread; on Discord thread reply, add as user comment
3. **Dashboard message**: Update pinned embed every N seconds or on board change
4. **Agent output relay**: Throttled forwarding of `handleAgentOutput` text to item thread (opt-in, max 1 msg/5s)

---

## Data Flow Diagram

```
Agent stdout
    │
    ▼
agent-protocol.ts (parse @@YOLIUM messages)
    │
    ▼
agent-runner.ts (handleProtocolMessage)
    │
    ├──► kanban-store.ts (update item, add comment)
    │       │
    │       ├──► IPC event → Renderer (UI update)
    │       │
    │       └──► discord-webhook.ts (POST embed)  ◄── Phase 1
    │               │
    │               ▼
    │           Discord channel
    │               │
    │               ▼ (button click / slash command)
    │           discord-bot.ts                     ◄── Phase 2
    │               │
    │               ▼
    │           kanban-handlers.ts (update item)
    │               │
    │               └──► kanban-store.ts (mutate)
    │
    └──► agent-runner.ts (resume if question answered)
```

---

## Configuration Model

```typescript
// Per-project Discord settings (stored in board or sidebar)
interface DiscordProjectConfig {
  // Phase 1
  webhookUrl?: string;
  notifyOn?: Array<'created' | 'started' | 'waiting' | 'completed' | 'failed' | 'moved' | 'comment'>;

  // Phase 2+
  botEnabled?: boolean;
  channelId?: string;
  threadPerItem?: boolean;
  streamAgentOutput?: boolean;
}

// Global Discord settings (stored in git-config)
interface DiscordGlobalConfig {
  botToken?: string;      // Encrypted
  applicationId?: string;
  defaultGuildId?: string;
}
```

---

## Security Considerations

- **Bot token**: Store encrypted alongside PAT in git-config store; never expose to renderer
- **Webhook URL**: Treat as secret (contains auth token); store in main process only
- **Channel permissions**: Bot should only operate in explicitly configured channels
- **Input sanitization**: Sanitize Discord user input before passing to kanban store (prevent injection into agent prompts)
- **Rate limiting**: Respect Discord rate limits (30 webhook calls/min, 50 bot API calls/s)
- **Agent output filtering**: Strip sensitive data (API keys, file paths) before posting to Discord

---

## Rough Effort Estimates

| Phase | Scope | New code |
|-------|-------|----------|
| Phase 1 | Webhook notifications | ~400 LOC |
| Phase 2 | Bot + slash commands + buttons | ~800 LOC |
| Phase 3 | Thread sync + dashboard + streaming | ~600 LOC |

---

## Open Questions

1. **Electron constraint**: Yolium is a desktop app — should the Discord bot run in-process or as a separate service? In-process is simpler but means notifications stop when the app is closed.
2. **Multi-user**: If multiple team members run Yolium on the same project, how do we avoid duplicate notifications? Options: leader election, shared config flag, or server-side relay.
3. **Webhook vs bot for Phase 1**: Webhooks are zero-dependency but one-way. If interaction is needed early, skip straight to bot.
4. **Mobile/web companion**: Should Discord serve as the "mobile app" for Yolium, or is a dedicated web dashboard better long-term?
