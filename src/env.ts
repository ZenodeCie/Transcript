import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseDuration } from "./shared/time.js"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface TranscriptEnv {
  host: string
  port: number
  publicUrl: string | null
  trustProxy: boolean
  apiKey: string
  signingSecret: string
  dataDir: string
  defaultTtlMs: number
  maxTtlMs: number
  purgeIntervalMs: number
  maxBodyBytes: number
  maxMessages: number
  rateLimitPerMinute: number
  discordToken: string | null
  discordApiBase: string
  fetchConcurrency: number
  inlineAssets: boolean
  maxAssetBytes: number
  maxTotalAssetBytes: number
  logLevel: LogLevel
  corsOrigin: string | null
}

export interface LoadEnvOptions {
  /** Server mode requires API_KEY and SIGNING_SECRET; the CLI does not. */
  requireSecrets?: boolean
  /** Override the .env path (defaults to ./.env). */
  envFile?: string
}

export class EnvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EnvError"
  }
}

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"]
const TRUE_VALUES = new Set(["1", "true", "yes", "on"])

/**
 * Minimal .env loader: KEY=VALUE, optional `export`, quotes and trailing comments.
 * Existing process.env values always win. No variable expansion.
 */
export function loadDotEnv(path = resolve(".env")): void {
  if (!existsSync(path)) return
  let content: string
  try {
    content = readFileSync(path, "utf8")
  } catch {
    return
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue

    const key = match[1]
    if (!key || process.env[key] !== undefined) continue

    let value = (match[2] ?? "").trim()
    const quote = value[0]
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1)
      if (quote === '"') {
        value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"')
      }
    } else {
      const commentIndex = value.indexOf(" #")
      if (commentIndex >= 0) value = value.slice(0, commentIndex).trim()
    }

    process.env[key] = value
  }
}

function readString(name: string, fallback: string): string {
  const value = process.env[name]
  return value === undefined ? fallback : value.trim()
}

function readRequiredString(name: string): string {
  const value = readString(name, "")
  if (!value) throw new EnvError(`${name} est obligatoire`)
  return value
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return fallback
  const value = Number(raw.trim())
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new EnvError(`${name} doit être un entier entre ${min} et ${max}`)
  }
  return value
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return fallback
  return TRUE_VALUES.has(raw.trim().toLowerCase())
}

function readUrl(name: string, value: string, allowPath: boolean): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new EnvError(`${name} doit être une URL absolue valide`)
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EnvError(`${name} doit utiliser http ou https`)
  }
  if (!allowPath && url.pathname !== "/") {
    throw new EnvError(`${name} doit être une origine sans chemin`)
  }
  if (url.search || url.hash) throw new EnvError(`${name} ne doit contenir ni query ni fragment`)
  return url.toString().replace(/\/$/, "")
}

function readTtl(name: string, fallback: string): number {
  const raw = readString(name, fallback)
  const parsed = parseDuration(raw)
  if (parsed === null || parsed <= 0) {
    throw new EnvError(`${name} doit être une durée valide (ex. 30m, 24h, 7d)`)
  }
  return parsed
}

export function loadEnv(options: LoadEnvOptions = {}): TranscriptEnv {
  loadDotEnv(options.envFile)

  const requireSecrets = options.requireSecrets ?? true
  const apiKey = requireSecrets ? readRequiredString("API_KEY") : readString("API_KEY", "")
  const signingSecret = requireSecrets ? readRequiredString("SIGNING_SECRET") : readString("SIGNING_SECRET", "")

  if (requireSecrets && apiKey.length < 16) {
    throw new EnvError("API_KEY est trop courte (16 caractères minimum)")
  }
  if (requireSecrets && signingSecret.length < 32) {
    throw new EnvError("SIGNING_SECRET est trop court (32 caractères minimum)")
  }

  const publicUrlRaw = readString("PUBLIC_URL", "")
  const corsOriginRaw = readString("CORS_ORIGIN", "")
  const discordApiBaseRaw = readString("DISCORD_API_BASE", "https://discord.com/api/v10")

  const defaultTtlMs = readTtl("DEFAULT_TTL", "7d")
  const maxTtlMs = readTtl("MAX_TTL", "30d")
  if (defaultTtlMs > maxTtlMs) {
    throw new EnvError("DEFAULT_TTL ne peut pas dépasser MAX_TTL")
  }

  const maxAssetBytes = readInt("MAX_ASSET_BYTES", 8 * 1024 * 1024, 1024, 512 * 1024 * 1024)
  const maxTotalAssetBytes = readInt("MAX_TOTAL_ASSET_BYTES", 32 * 1024 * 1024, 1024, 1024 * 1024 * 1024)
  if (maxAssetBytes > maxTotalAssetBytes) {
    throw new EnvError("MAX_ASSET_BYTES ne peut pas dépasser MAX_TOTAL_ASSET_BYTES")
  }

  const logLevelRaw = readString("LOG_LEVEL", "info").toLowerCase()
  if (!LOG_LEVELS.includes(logLevelRaw as LogLevel)) {
    throw new EnvError(`LOG_LEVEL doit être l'un de : ${LOG_LEVELS.join(", ")}`)
  }

  const token = readString("DISCORD_BOT_TOKEN", "")
  if (token && /\s/.test(token)) {
    throw new EnvError("DISCORD_BOT_TOKEN ne doit pas contenir d'espace")
  }

  return {
    host: readString("HOST", "0.0.0.0"),
    port: readInt("PORT", 8787, 1, 65535),
    publicUrl: publicUrlRaw ? readUrl("PUBLIC_URL", publicUrlRaw, false) : null,
    trustProxy: readBoolean("TRUST_PROXY", false),
    apiKey,
    signingSecret,
    dataDir: resolve(readString("DATA_DIR", "./data")),
    defaultTtlMs,
    maxTtlMs,
    purgeIntervalMs: readInt("PURGE_INTERVAL_MS", 3_600_000, 10_000, 86_400_000),
    maxBodyBytes: readInt("MAX_BODY_BYTES", 32 * 1024 * 1024, 1024, 512 * 1024 * 1024),
    maxMessages: readInt("MAX_MESSAGES", 10_000, 1, 100_000),
    rateLimitPerMinute: readInt("RATE_LIMIT_PER_MINUTE", 30, 1, 100_000),
    discordToken: token || null,
    discordApiBase: readUrl("DISCORD_API_BASE", discordApiBaseRaw, true),
    fetchConcurrency: readInt("FETCH_CONCURRENCY", 4, 1, 16),
    inlineAssets: readBoolean("INLINE_ASSETS", true),
    maxAssetBytes,
    maxTotalAssetBytes,
    logLevel: logLevelRaw as LogLevel,
    corsOrigin: corsOriginRaw ? readUrl("CORS_ORIGIN", corsOriginRaw, false) : null,
  }
}
