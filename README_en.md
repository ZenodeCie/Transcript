# Zenode Transcript

Web service that turns **Discord ticket channels** into **self-contained HTML transcripts** for the ZenodeBots ecosystem. It fetches a channel (or accepts raw JSON messages), normalizes them, renders a Discord-faithful page, and serves it through an **expiring signed link**.

- Full rendering: Discord markdown, mentions, role colors, custom emojis, localized timestamps, spoilers, embeds, replies, reactions, stickers, polls, forwarded messages, buttons/selects and **V2 components** (containers, sections, media).
- Attachments are **inlined** as `data:` URLs so they survive Discord CDN link expiry.
- Local storage (JSON `0600`), automatic TTL purge, **zero runtime dependencies**.
- API-key protected, HMAC links, strict CSP, systematic escaping (XSS) and CDN allowlist (SSRF).
- Also ships a **CLI** to produce a static HTML file.

## Table of contents

- [Architecture](#architecture)
- [Requirements](#requirements)
- [Install](#install)
- [Configuration](#configuration)
- [Run](#run)
- [HTTP API](#http-api)
- [Input format](#input-format)
- [Security](#security)
- [Retention and storage](#retention-and-storage)
- [CLI](#cli)
- [PM2 deployment](#pm2-deployment)
- [Manual tests](#manual-tests)
- [Known limitations](#known-limitations)

## Architecture

```text
src/
├── index.ts              # Boot, health, purge, graceful shutdown
├── cli.ts                # Static HTML generation
├── env.ts                # .env + validation
├── logger.ts             # Prefixed logs + secret redaction
├── shared/               # Types, guards, IDs, durations
├── render/               # Markdown, mentions, embeds, components, page
├── discord/              # REST, normalization, fetch, assets
├── storage/              # Atomic JSON store, signed links
└── server/               # HTTP routing, auth, rate limit
```

## Requirements

- **Node.js ≥ 20** (native fetch, `AbortSignal.timeout`, ESM).
- No database.
- A Discord bot token **only** if the service fetches messages itself; otherwise raw JSON messages are accepted.

## Install

```bash
git clone https://github.com/ZenodeCie/Transcript.git
cd Transcript
npm ci
cp .env.example .env
# set API_KEY and SIGNING_SECRET (see below)
npm run build
npm start
```

Generating secrets:

```bash
openssl rand -hex 32   # API_KEY
openssl rand -hex 48   # SIGNING_SECRET
```

## Configuration

All variables are read from the environment, with optional loading of a root `.env` file (already-defined process variables win).

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | HTTP bind address. |
| `PORT` | `8787` | HTTP port. |
| `PUBLIC_URL` | — | Public base for signed links (e.g. `https://transcripts.example.com`), no trailing slash. Empty = derived from the request origin. |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-Proto` / `X-Forwarded-For`. Enable only behind a controlled reverse proxy. |
| `API_KEY` | — | **Required.** Management routes key (`X-API-Key` or `Authorization: Bearer`). |
| `SIGNING_SECRET` | — | **Required.** HMAC secret for view links. |
| `DATA_DIR` | `./data` | Transcript storage directory. |
| `DEFAULT_TTL` | `7d` | Default lifetime (`30m`, `24h`, `7d`, or milliseconds). |
| `MAX_TTL` | `30d` | Maximum accepted lifetime. |
| `PURGE_INTERVAL_MS` | `3600000` | Expired transcript purge interval. |
| `MAX_BODY_BYTES` | `33554432` | Maximum JSON body size (32 MiB). |
| `MAX_MESSAGES` | `10000` | Maximum messages per transcript. |
| `RATE_LIMIT_PER_MINUTE` | `30` | Maximum creations per minute per key/IP. |
| `DISCORD_BOT_TOKEN` | — | REST token for channel fetching (optional). |
| `DISCORD_API_BASE` | `https://discord.com/api/v10` | Discord API base. |
| `FETCH_CONCURRENCY` | `4` | Discord/assets concurrency. |
| `INLINE_ASSETS` | `true` | Inline attachments as `data:`. |
| `MAX_ASSET_BYTES` | `8388608` | Max size per inlined attachment (8 MiB). |
| `MAX_TOTAL_ASSET_BYTES` | `33554432` | Max total inlined assets per transcript (32 MiB). |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`. |
| `CORS_ORIGIN` | — | Allowed browser origin; empty = no CORS. |

The service **refuses to start** when `API_KEY` or `SIGNING_SECRET` is missing, or when a value is invalid (explicit message, no secret printed).

## Run

```bash
npm run build
npm start
# development (continuous compile, runs nothing):
npm run dev
```

On boot the service validates the environment and Node ≥ 20, creates `DATA_DIR/transcripts` (`0700`), rebuilds its index, purges expired transcripts, starts HTTP and the periodic purge, and handles `SIGINT`/`SIGTERM` gracefully.

## HTTP API

Management routes require `X-API-Key: <API_KEY>` or `Authorization: Bearer <API_KEY>`. Pages under `/t/…` only use the signed link.

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Service health (public, no secrets). |
| `GET` | `/` | — | Service name and version. |
| `POST` | `/v1/transcripts` | API key | Create a transcript (Discord fetch or JSON messages). |
| `GET` | `/v1/transcripts` | API key | Paginated metadata list (`?limit=20&offset=0`). |
| `GET` | `/v1/transcripts/:id` | API key | Metadata + full JSON payload. |
| `DELETE` | `/v1/transcripts/:id` | API key | Delete a transcript. |
| `GET` | `/t/:id?exp=…&sig=…` | Signed link | HTML transcript page. |

### Create from Discord

```bash
curl -sS -X POST "$BASE/v1/transcripts" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "123456789012345678",
    "guildId": "987654321098765432",
    "title": "Ticket #42 — Vyral",
    "expiresIn": "7d"
  }'
```

`201` response:

```json
{
  "id": "V1StGXR8_Z5jdHi6",
  "url": "https://transcripts.example.com/t/V1StGXR8_Z5jdHi6?exp=1790000000&sig=…",
  "createdAt": "2026-10-23T12:00:00.000Z",
  "expiresAt": "2026-10-30T12:00:00.000Z",
  "messageCount": 128,
  "sizeBytes": 2456789
}
```

### Create from JSON messages

`messages` is an array of **raw Discord API message objects** (as returned by `GET /channels/:id/messages`). The `channel`, `guild`, `roles`, `members` and `bot` contexts are optional but improve the rendering.

```bash
curl -sS -X POST "$BASE/v1/transcripts" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "123456789012345678",
    "title": "Ticket #42",
    "channel": { "id": "123456789012345678", "name": "ticket-0042", "type": 0 },
    "guild": { "id": "987654321098765432", "name": "Zenode", "icon": "a_…" },
    "roles": [{ "id": "111", "name": "Staff", "color": 3447003, "position": 5 }],
    "messages": [
      {
        "id": "222",
        "channel_id": "123456789012345678",
        "author": { "id": "333", "username": "vyral", "global_name": "Vyral", "avatar": "…", "bot": false },
        "content": "Hello **everyone**!",
        "timestamp": "2026-10-23T11:58:00.000Z",
        "edited_timestamp": null,
        "type": 0,
        "embeds": [],
        "attachments": [],
        "components": [],
        "mentions": { "users": [], "roles": [], "channels": [] }
      }
    ]
  }'
```

Root fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `channelId` | snowflake | yes | Ticket channel. |
| `guildId` | snowflake | no | Inferred from the channel when fetching. |
| `title` | string | no | Displayed title (≤ 200 chars, control characters stripped). |
| `expiresIn` | duration | no | `30m`, `24h`, `7d`, or milliseconds; capped by `MAX_TTL`. |
| `messages` | array | no | Raw Discord messages. Omitted → REST fetch (token required). |
| `channel` | object | no | `id`, `name`, `topic`, `type`, `parent_id`. |
| `guild` | object | no | `id`, `name`, `icon`. |
| `roles` | array | no | `id`, `name`, `color`, `position`, `colors`. |
| `members` | array | no | `user`, `nick`, `avatar`, `roles`. |
| `bot` | object | no | `id`, `username`, `avatar` (header bot badge). |

### Errors

```json
{ "error": { "code": "invalid_payload", "message": "…" } }
```

| Status | Main codes |
| --- | --- |
| `400` | `invalid_json`, `invalid_payload`, `invalid_channel_id`, `invalid_expiry`, `discord_not_configured` |
| `401` | `unauthorized` |
| `403` | `invalid_signature` |
| `404` | `not_found` |
| `405` | `method_not_allowed` |
| `410` | `expired` |
| `413` | `body_too_large` |
| `415` | `unsupported_media_type` |
| `429` | `rate_limited` |
| `502` | `discord_error` |
| `500` | `internal_error` |

## Input format

Raw Discord objects are normalized. Exploited fields:

- message: `id`, `channel_id`, `author`, `member`, `content`, `timestamp`, `edited_timestamp`, `type`, `pinned`, `webhook_id`, `mentions`, `mention_roles`, `mention_channels`, `referenced_message`, `embeds`, `attachments`, `components`, `sticker_items`, `reactions`, `poll`, `interaction`, `message_snapshots`.
- embed: `author`, `title`, `description`, `url`, `color`, `fields`, `thumbnail`, `image`, `footer`, `timestamp`.
- components: types 1 (action row), 2 (button), 3 (string select), 5–8 (user/role/mentionable/channel selects), 9 (section), 10 (text display), 11 (thumbnail), 12 (media gallery), 13 (file), 14 (separator), 17 (container).
- attachments: `id`, `filename`, `url`, `proxy_url`, `content_type`, `size`, `width`, `height`.

Unknown or partial messages never break rendering: missing fields are ignored and a warning is logged.

## Security

- **API key** compared in constant time (`timingSafeEqual` over SHA-256 digests).
- **Signed links**: `sig = base64url(HMAC-SHA256(SIGNING_SECRET, "{id}.{exp}"))`, constant-time comparison. Any change to the ID or expiry invalidates the link.
- **XSS**: systematic HTML escaping, validated URLs (`http`/`https`), no user HTML, strict CSP (`default-src 'none'`, CDN allowed only for the render script).
- **SSRF**: assets are downloaded only from known Discord hosts, without following redirects.
- **Secrets**: never logged, never returned by the API, never written to `DATA_DIR`.
- **Storage**: files `0600`, directory `0700`, atomic writes (temp + rename).
- **Responses**: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- **Rate limit**: in-memory token bucket per key/IP; `Retry-After` on rejection.

> Transcript pages contain private conversations: only share signed links with concerned people, use HTTPS, and prefer a short TTL for sensitive data.

## Retention and storage

- One file per transcript: `DATA_DIR/transcripts/{id}.json` (`version`, `meta`, `payload`).
- `expiresAt = createdAt + TTL`; the signed link carries the same expiry.
- Purge: on boot, hourly (`PURGE_INTERVAL_MS`), and on read (expired → `410`, then deleted).
- In-memory metadata index rebuilt on boot for listings and statistics.
- `GET /health` exposes transcript count and disk usage, never paths or contents.

## CLI

Generate a static HTML file without the server or API key:

```bash
npm run build

# From a Discord channel (DISCORD_BOT_TOKEN required)
node dist/cli.js --channel 123456789012345678 --out ticket.html --title "Ticket #42"

# From a JSON file (same shape as the POST /v1/transcripts body)
node dist/cli.js --payload ticket.json --out ticket.html

# Options
#   --max-messages <n>   message limit
#   --no-inline          do not download attachments
#   --help
```

The output is self-contained (apart from the CDN render script and system fonts) and can be archived or emailed.

## PM2 deployment

```bash
npm ci
npm run build
npm run pm2:start
npm run pm2:logs
```

`ecosystem.config.cjs` defines `zenode-transcript` (fork, autorestart, 512 MB memory limit). Put it behind an HTTPS reverse proxy (nginx/Caddy) and set `PUBLIC_URL` + `TRUST_PROXY=true`.

## Manual tests

1. **Build**: `npm run build` passes.
2. **Health**: `curl -s http://127.0.0.1:8787/health`.
3. **Auth**: `POST /v1/transcripts` without a key → `401`; wrong key → `401`.
4. **JSON creation**: send 2–3 messages with markdown, embed, button, select and image; check `201` and the URL.
5. **Rendering**: open the URL; check names/avatars/colors, markdown, mentions, emojis, localized timestamps, clickable spoilers, replies (jump), reactions, embeds, components, attachments.
6. **Signature**: tamper with `sig` → `403`; remove `sig` → `403`; wait for expiry (short TTL) → `410`.
7. **Deletion**: `DELETE /v1/transcripts/:id` → `204`, then the URL → `404`.
8. **Discord fetch**: with `DISCORD_BOT_TOKEN`, create from a real channel; check chronological order and pagination (> 100 messages).
9. **Assets**: after CDN URLs expire, reopen the HTML; images must still load (inlining).
10. **Limits**: body > `MAX_BODY_BYTES` → `413`; `expiresIn` > `MAX_TTL` → `400`; > `MAX_MESSAGES` → `400`.
11. **Logs**: no token, API key, signature or message content.
12. **Shutdown**: `SIGINT` → graceful stop, no leftover temp file.

## Known limitations

- Component rendering relies on the `@derockdev/discord-components-core` web component loaded from jsDelivr; offline, content stays readable but Discord message styling may degrade.
- Messages older than the channel's retention cannot be recovered.
- Reactions show counters known at fetch time (no real-time updates).
- Threads are not merged into the parent channel transcript.
- Attachments above the limits remain external links (which may expire).
