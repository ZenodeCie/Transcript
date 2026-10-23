import { randomBytes } from "node:crypto"

const SNOWFLAKE_PATTERN = /^\d{17,20}$/
const TRANSCRIPT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/
const MAX_ID_LENGTH = 128

/** Discord snowflakes are 17-20 digits. */
export function isSnowflake(value: unknown): value is string {
  return typeof value === "string" && SNOWFLAKE_PATTERN.test(value)
}

/** External identifiers (bot_id, guild slug…) are alphanumeric with dashes/underscores. */
export function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(value)
}

export function isTranscriptId(value: unknown): value is string {
  return typeof value === "string" && TRANSCRIPT_ID_PATTERN.test(value)
}

/** 12 random bytes → 16 URL-safe characters. */
export function newTranscriptId(): string {
  return randomBytes(12).toString("base64url")
}

/** Discord snowflakes fit in a JS number only approximately; keep them as strings. */
export function snowflakeToNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
