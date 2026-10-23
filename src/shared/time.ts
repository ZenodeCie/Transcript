const DURATION_PATTERN = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i

const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
}

/** Parse "30m", "24h", "7d", "1w", "1500ms" or a millisecond number. Returns null when invalid. */
export function parseDuration(input: unknown): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) && input >= 0 ? Math.round(input) : null
  }
  if (typeof input !== "string") return null

  const value = input.trim()
  if (!value) return null
  if (/^\d+$/.test(value)) return Number(value)

  const match = DURATION_PATTERN.exec(value)
  if (!match) return null

  const amount = Number(match[1])
  const unit = match[2]?.toLowerCase()
  if (!Number.isFinite(amount) || !unit) return null

  const factor = UNIT_TO_MS[unit]
  if (!factor) return null
  return Math.round(amount * factor)
}

/** Human readable duration, used in logs and metadata only. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s"
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`
  return `${Math.round(ms / 86_400_000)}d`
}

export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString()
}

/** Clamp a TTL into [minimum, maximum]; returns the maximum when the input is missing. */
export function clampDuration(ms: number | null, fallbackMs: number, maximumMs: number): number {
  const value = ms === null ? fallbackMs : ms
  if (value < 0) return 0
  return Math.min(value, maximumMs)
}
