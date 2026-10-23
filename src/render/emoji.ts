import type { TranscriptEmoji } from "../shared/types.js"
import { escapeHtml } from "./html.js"

const EMOJI_ID_PATTERN = /^\d{17,20}$/
const EMOJI_NAME_PATTERN = /^[A-Za-z0-9_~]{1,64}$/

export function emojiCdnUrl(emoji: TranscriptEmoji): string | null {
  if (!emoji.id || !EMOJI_ID_PATTERN.test(emoji.id)) return null
  const extension = emoji.animated ? "gif" : "png"
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}`
}

export function renderEmoji(emoji: TranscriptEmoji | null, className = "emoji"): string {
  if (!emoji) return ""
  const url = emojiCdnUrl(emoji)
  if (url) {
    const name = emoji.name && EMOJI_NAME_PATTERN.test(emoji.name) ? emoji.name : "emoji"
    return `<img class="${escapeHtml(className)}" src="${url}" alt=":${escapeHtml(name)}:" loading="lazy">`
  }
  if (emoji.name) return `<span class="${escapeHtml(className)}">${escapeHtml(emoji.name)}</span>`
  return ""
}

/** Custom emoji syntax inside message content: <:name:id> or <a:name:id>. */
export function customEmoji(name: string, id: string, animated: boolean): string | null {
  if (!EMOJI_ID_PATTERN.test(id) || !EMOJI_NAME_PATTERN.test(name)) return null
  const extension = animated ? "gif" : "png"
  return `<img class="emoji" src="https://cdn.discordapp.com/emojis/${id}.${extension}" alt=":${escapeHtml(name)}:" loading="lazy">`
}
