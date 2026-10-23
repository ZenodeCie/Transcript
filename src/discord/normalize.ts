import type { TranscriptAttachment, TranscriptEmbed, TranscriptPayload } from "../shared/types.js"
import { safeExternalUrl, safeMediaUrl } from "../render/html.js"

export interface RawUser {
  id: string
  username?: string
  global_name?: string | null
  discriminator?: string
  avatar?: string | null
  bot?: boolean
}

export interface RawMember {
  nick?: string | null
  avatar?: string | null
  roles?: string[]
  user?: RawUser
}

export interface RawRole {
  id: string
  name: string
  color?: number
  position?: number
  colors?: { primary_color?: number | null }
}

export interface RawChannel {
  id: string
  name?: string
  topic?: string | null
  type?: number
  parent_id?: string | null
  guild_id?: string | null
}

export interface RawGuild {
  id: string
  name: string
  icon?: string | null
}

export interface RawAttachment {
  id: string
  filename: string
  url: string
  proxy_url?: string
  content_type?: string | null
  size?: number
  width?: number | null
  height?: number | null
}

export interface RawReaction {
  count?: number
  count_details?: { normal?: number; burst?: number }
  me?: boolean
  emoji?: { id?: string | null; name?: string | null; animated?: boolean }
}

export interface RawMention {
  id: string
  username?: string
  global_name?: string | null
  avatar?: string | null
  bot?: boolean
}

export interface RawMessage {
  id: string
  channel_id: string
  author?: RawUser
  member?: RawMember | null
  content?: string
  timestamp: string
  edited_timestamp?: string | null
  type?: number
  pinned?: boolean
  webhook_id?: string | null
  mentions?: RawMention[]
  mention_roles?: string[]
  mention_channels?: Array<{ id: string; name: string }>
  referenced_message?: RawMessage | null
  embeds?: any[]
  attachments?: RawAttachment[]
  components?: any[]
  sticker_items?: any[]
  reactions?: RawReaction[]
  poll?: any
  interaction?: { name?: string; type?: number; user?: RawUser }
  message_snapshots?: Array<{ message?: RawMessage }>
}

const ALLOWED_ASSET_HOSTS = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
  "images-ext-1.discordapp.net",
  "images-ext-2.discordapp.net",
])

export function avatarUrl(author: RawUser | undefined): string | null {
  if (!author?.avatar || !author.id) return null
  const animated = author.avatar.startsWith("a_")
  const extension = animated ? "gif" : "png"
  return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${extension}?size=256`
}

export function guildIconUrl(guild: RawGuild | undefined): string | null {
  if (!guild?.icon || !guild.id) return null
  const animated = guild.icon.startsWith("a_")
  const extension = animated ? "gif" : "png"
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${extension}?size=256`
}

export function emojiCdn(id: string, name: string | undefined, animated: boolean): string {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? "gif" : "png"}`
}

export function stickerUrl(sticker: any): string | null {
  const id = typeof sticker.id === "string" ? sticker.id : null
  const format = sticker.format_type
  if (!id) return null
  if (format === 1 || format === 2) return `https://cdn.discordapp.com/stickers/${id}.png`
  if (format === 4) return `https://cdn.discordapp.com/stickers/${id}.gif`
  return null
}

export function roleColor(color: number | undefined, colors?: any): string | null {
  const value = typeof colors?.primary_color === "number" ? colors.primary_color : color
  if (typeof value !== "number" || value <= 0 || value > 0xffffff) return null
  return `#${value.toString(16).padStart(6, "0")}`
}

export function toSnowflakeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && /^\d{17,20}$/.test(item))
}

export function isDiscordAssetUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:") return false
    return ALLOWED_ASSET_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

export function attachmentIsImage(attachment: RawAttachment): boolean {
  const type = attachment.content_type?.toLowerCase() ?? ""
  if (type.startsWith("image/")) return true
  return /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(attachment.filename)
}

export function attachmentIsVideo(attachment: RawAttachment): boolean {
  const type = attachment.content_type?.toLowerCase() ?? ""
  if (type.startsWith("video/")) return true
  return /\.(mp4|webm|mov|mkv)$/i.test(attachment.filename)
}

export function attachmentIsAudio(attachment: RawAttachment): boolean {
  const type = attachment.content_type?.toLowerCase() ?? ""
  if (type.startsWith("audio/")) return true
  return /\.(mp3|ogg|wav|flac|m4a|opus)$/i.test(attachment.filename)
}

export function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

export function normalizeAttachment(attachment: RawAttachment, inlineDataUrl: string | null): TranscriptAttachment {
  const url = safeExternalUrl(attachment.url) ?? ""
  return {
    id: typeof attachment.id === "string" ? attachment.id : "",
    name: typeof attachment.filename === "string" ? attachment.filename : "fichier",
    url,
    contentType: typeof attachment.content_type === "string" ? attachment.content_type : null,
    size: typeof attachment.size === "number" ? attachment.size : null,
    width: typeof attachment.width === "number" ? attachment.width : null,
    height: typeof attachment.height === "number" ? attachment.height : null,
    isImage: attachmentIsImage(attachment),
    isVideo: attachmentIsVideo(attachment),
    isAudio: attachmentIsAudio(attachment),
    inlineDataUrl,
  }
}
