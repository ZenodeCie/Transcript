import { TRANSCRIPT_VERSION } from "./types.js"
import type { TranscriptMeta, TranscriptPayload, TranscriptRecord } from "./types.js"
import { isSnowflake, isTranscriptId } from "./ids.js"

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

/**
 * Strip control characters (keeping \n and \t), normalize line endings and truncate.
 * Used for every string that reaches the renderer.
 */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  const normalized = value.replace(/\r\n?/g, "\n").replace(CONTROL_CHARS, "")
  if (normalized.length <= maxLength) return normalized
  return Array.from(normalized).slice(0, maxLength).join("")
}

export function cleanOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const cleaned = cleanText(value, maxLength)
  return cleaned.length > 0 ? cleaned : null
}

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function asInteger(value: unknown): number | null {
  const number = asFiniteNumber(value)
  return number === null ? null : Math.trunc(number)
}

export function asBoolean(value: unknown): boolean {
  return value === true
}

export function asStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, maxItems)
    .map((item) => cleanText(item, maxLength))
    .filter((item) => item.length > 0)
}

/** Accepts a Discord color integer or a #rrggbb / #rgb string. Returns #rrggbb or null. */
export function normalizeColor(value: unknown, zeroIsNull = false): string | null {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffff) return null
    if (value === 0 && zeroIsNull) return null
    return `#${value.toString(16).padStart(6, "0")}`
  }
  if (typeof value === "string") {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
    if (!match) return null
    const hex = match[1] ?? ""
    const expanded = hex.length === 3 ? hex.split("").map((char) => `${char}${char}`).join("") : hex
    if (zeroIsNull && expanded.toLowerCase() === "000000") return null
    return `#${expanded.toLowerCase()}`
  }
  return null
}

function isMessageRecord(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.authorId === "string" &&
    typeof value.content === "string" &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    Array.isArray(value.embeds) &&
    Array.isArray(value.attachments) &&
    Array.isArray(value.components)
  )
}

export function isTranscriptPayload(value: unknown): value is TranscriptPayload {
  if (!isRecord(value)) return false
  if (value.version !== TRANSCRIPT_VERSION) return false
  if (!isRecord(value.channel) || !isSnowflake(value.channel.id) || typeof value.channel.name !== "string") return false
  if (!isRecord(value.profiles) || !isRecord(value.roles) || !isRecord(value.channels)) return false
  if (!Array.isArray(value.messages) || !value.messages.every(isMessageRecord)) return false
  if (value.guild !== null && (!isRecord(value.guild) || typeof value.guild.name !== "string")) return false
  return true
}

export function isTranscriptMeta(value: unknown): value is TranscriptMeta {
  if (!isRecord(value)) return false
  return (
    isTranscriptId(value.id) &&
    typeof value.channelId === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt) &&
    typeof value.messageCount === "number" &&
    typeof value.sizeBytes === "number" &&
    (value.source === "discord" || value.source === "json")
  )
}

export function isTranscriptRecord(value: unknown): value is TranscriptRecord {
  if (!isRecord(value)) return false
  return value.version === TRANSCRIPT_VERSION && isTranscriptMeta(value.meta) && isTranscriptPayload(value.payload)
}
