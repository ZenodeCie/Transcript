/** Source of truth for the normalized transcript format. Bump TRANSCRIPT_VERSION on breaking changes. */
export const TRANSCRIPT_VERSION = 1 as const

export interface TranscriptGuild {
  id: string
  name: string
  iconUrl: string | null
}

export interface TranscriptChannel {
  id: string
  name: string
  topic: string | null
  type: number
  parentName: string | null
}

export interface TranscriptRole {
  id: string
  name: string
  color: string | null
  position: number
}

export interface TranscriptProfile {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  bot: boolean
  verified: boolean
  color: string | null
  roles: string[]
}

export interface TranscriptAttachment {
  id: string
  name: string
  url: string
  contentType: string | null
  size: number | null
  width: number | null
  height: number | null
  isImage: boolean
  isVideo: boolean
  isAudio: boolean
  /** Populated during creation when inline assets are enabled. */
  inlineDataUrl: string | null
}

export interface TranscriptEmbedAuthor {
  name: string
  url: string | null
  iconUrl: string | null
}

export interface TranscriptEmbedField {
  name: string
  value: string
  inline: boolean
}

export interface TranscriptEmbedFooter {
  text: string
  iconUrl: string | null
}

export interface TranscriptEmbed {
  author: TranscriptEmbedAuthor | null
  title: string | null
  description: string | null
  url: string | null
  color: string | null
  fields: TranscriptEmbedField[]
  thumbnailUrl: string | null
  imageUrl: string | null
  footer: TranscriptEmbedFooter | null
  timestamp: number | null
}

export interface TranscriptEmoji {
  id: string | null
  name: string | null
  animated: boolean
}

export interface TranscriptButton {
  type: "button"
  style: number
  label: string
  emoji: TranscriptEmoji | null
  url: string | null
  disabled: boolean
}

export interface TranscriptSelectOption {
  label: string
  value: string
  description: string | null
  emoji: TranscriptEmoji | null
  default: boolean
}

export interface TranscriptSelect {
  type: "select"
  selectType: number
  placeholder: string
  options: TranscriptSelectOption[]
  disabled: boolean
  minValues: number | null
  maxValues: number | null
}

export interface TranscriptTextDisplay {
  type: "text"
  content: string
}

export interface TranscriptThumbnail {
  type: "thumbnail"
  url: string
  description: string | null
  spoiler: boolean
}

export interface TranscriptMediaItem {
  url: string
  description: string | null
  spoiler: boolean
}

export interface TranscriptMediaGallery {
  type: "media"
  items: TranscriptMediaItem[]
}

export interface TranscriptFile {
  type: "file"
  url: string
  name: string
  size: number | null
  spoiler: boolean
}

export interface TranscriptSeparator {
  type: "separator"
  divider: boolean
  spacing: number
}

export interface TranscriptSection {
  type: "section"
  components: TranscriptComponent[]
  accessory: TranscriptComponent | null
}

export interface TranscriptContainer {
  type: "container"
  accentColor: string | null
  spoiler: boolean
  components: TranscriptComponent[]
}

export interface TranscriptActionRow {
  type: "actionRow"
  components: TranscriptComponent[]
}

export type TranscriptComponent =
  | TranscriptActionRow
  | TranscriptButton
  | TranscriptSelect
  | TranscriptTextDisplay
  | TranscriptThumbnail
  | TranscriptMediaGallery
  | TranscriptFile
  | TranscriptSeparator
  | TranscriptSection
  | TranscriptContainer

export interface TranscriptPollAnswer {
  text: string
  emoji: TranscriptEmoji | null
  voteCount: number
  me: boolean
}

export interface TranscriptPoll {
  question: string
  answers: TranscriptPollAnswer[]
  totalVotes: number
  multiple: boolean
  expired: boolean
  durationHours: number | null
}

export interface TranscriptReaction {
  emoji: TranscriptEmoji
  count: number
  me: boolean
}

export interface TranscriptSticker {
  id: string
  name: string
  format: number
  url: string | null
}

export interface TranscriptReply {
  messageId: string
  authorId: string | null
  content: string
  attachmentName: string | null
  deleted: boolean
}

export interface TranscriptForwardedMessage {
  authorId: string | null
  content: string
  createdAt: number | null
  embeds: TranscriptEmbed[]
  attachments: TranscriptAttachment[]
}

export interface TranscriptInteraction {
  name: string
  type: number
  userId: string | null
}

export interface TranscriptMessage {
  id: string
  authorId: string
  content: string
  createdAt: number
  editedAt: number | null
  system: boolean
  pinned: boolean
  type: number
  webhook: boolean
  reply: TranscriptReply | null
  embeds: TranscriptEmbed[]
  attachments: TranscriptAttachment[]
  components: TranscriptComponent[]
  reactions: TranscriptReaction[]
  stickers: TranscriptSticker[]
  poll: TranscriptPoll | null
  interaction: TranscriptInteraction | null
  forwarded: TranscriptForwardedMessage[]
}

export interface TranscriptBot {
  id: string
  name: string
  avatarUrl: string | null
}

export interface TranscriptPayload {
  version: typeof TRANSCRIPT_VERSION
  guild: TranscriptGuild | null
  channel: TranscriptChannel
  bot: TranscriptBot | null
  profiles: Record<string, TranscriptProfile>
  roles: Record<string, TranscriptRole>
  channels: Record<string, { id: string; name: string }>
  messages: TranscriptMessage[]
}

export interface TranscriptMeta {
  id: string
  channelId: string
  guildId: string | null
  title: string
  source: "discord" | "json"
  createdAt: number
  expiresAt: number
  messageCount: number
  sizeBytes: number
}

export interface TranscriptRecord {
  version: typeof TRANSCRIPT_VERSION
  meta: TranscriptMeta
  payload: TranscriptPayload
}
