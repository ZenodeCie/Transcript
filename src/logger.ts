export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const SENSITIVE_KEY = /(token|secret|key|authorization|signature|sig|cookie|password|passphrase)/i
const QUERY_SECRET = /([?&](?:sig|signature|token|key|api_key|authorization)=)[^&\s]+/gi
const BEARER_SECRET = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi
const BOT_TOKEN = /\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{25,40}\b/g

export function redactString(value: string): string {
  return value.replace(QUERY_SECRET, "$1<redacted>").replace(BEARER_SECRET, "Bearer <redacted>").replace(BOT_TOKEN, "<redacted>")
}

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return redactString(value)
  if (value === null || typeof value !== "object") return value
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) }
  if (depth >= 4) return "<object>"

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redactValue(item, depth + 1))
  }

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY.test(key) ? "<redacted>" : redactValue(item, depth + 1)
  }
  return output
}

export function redact(value: unknown): unknown {
  return redactValue(value, 0)
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class Logger {
  constructor(
    private readonly scope: string,
    private readonly level: LogLevel = "info",
  ) {}

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.level)
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write("debug", message, meta)
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write("info", message, meta)
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("warn", message, meta)
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write("error", message, meta)
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.level]) return

    const prefix = `[Transcript][${this.scope}] ${redactString(message)}`
    if (meta && Object.keys(meta).length > 0) {
      let serialized: string
      try {
        serialized = JSON.stringify(redact(meta))
      } catch {
        serialized = '{"meta":"<unserializable>"}'
      }
      this.emit(level, `${prefix} ${serialized}`)
      return
    }
    this.emit(level, prefix)
  }

  private emit(level: LogLevel, line: string): void {
    if (level === "error") {
      console.error(line)
      return
    }
    if (level === "warn") {
      console.warn(line)
      return
    }
    console.log(line)
  }
}
