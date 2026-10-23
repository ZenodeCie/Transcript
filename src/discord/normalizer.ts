import type {
  TranscriptAttachment,
  TranscriptComponent,
  TranscriptEmbed,
  TranscriptEmbedField,
  TranscriptForwardedMessage,
  TranscriptInteraction,
  TranscriptMessage,
  TranscriptPayload,
  TranscriptPoll,
  TranscriptPollAnswer,
  TranscriptProfile,
  TranscriptReaction,
  TranscriptReply,
  TranscriptRole,
  TranscriptSticker,
} from "../shared/types.js"
import { TRANSCRIPT_VERSION } from "../shared/types.js"
import { cleanText } from "../shared/guards.js"
import {
  RawMessage,
  RawRole,
  RawGuild,
  RawChannel,
  RawUser,
  RawReaction,
  avatarUrl,
  guildIconUrl,
  roleColor,
  toSnowflakeArray,
  normalizeAttachment,
  parseTimestamp,
  stickerUrl,
} from "./normalize.js"

function displayName(author?: RawUser, member?: any): string {
  if (member?.nick && typeof member.nick === "string" && member.nick.trim()) return member.nick.trim().slice(0, 80)
  if (author?.global_name && typeof author.global_name === "string" && author.global_name.trim()) {
    return author.global_name.trim().slice(0, 80)
  }
  if (author?.username && typeof author.username === "string") return author.username.trim().slice(0, 80)
  return "Utilisateur inconnu"
}

function buildProfile(
  id: string,
  author: RawUser | undefined,
  member: any,
  color: string | null,
  roles: string[],
): TranscriptProfile {
  const name = displayName(author, member)
  return {
    id,
    username: author?.username?.trim().slice(0, 80) ?? name,
    displayName: name,
    avatarUrl: avatarUrl(author),
    bot: !!author?.bot,
    verified: false,
    color,
    roles: roles.slice(0, 100),
  }
}

function normalizeEmbed(embed: any): TranscriptEmbed | null {
  if (!embed || typeof embed !== "object") return null
  const fields: TranscriptEmbedField[] = Array.isArray(embed.fields)
    ? embed.fields
        .filter((field: any) => field && typeof field === "object")
        .slice(0, 25)
        .map((field: any) => ({
          name: cleanText(field.name, 256),
          value: cleanText(field.value, 1024),
          inline: !!field.inline,
        }))
    : []

  const color = typeof embed.color === "number" && embed.color >= 0 && embed.color <= 0xffffff
    ? `#${embed.color.toString(16).padStart(6, "0")}`
    : null

  const timestamp = parseTimestamp(embed.timestamp)

  return {
    author: embed.author && typeof embed.author === "object" && typeof embed.author.name === "string"
      ? {
          name: cleanText(embed.author.name, 256),
          url: typeof embed.author.url === "string" ? embed.author.url : null,
          iconUrl: typeof embed.author.icon_url === "string" ? embed.author.icon_url : null,
        }
      : null,
    title: typeof embed.title === "string" ? cleanText(embed.title, 256) : null,
    description: typeof embed.description === "string" ? cleanText(embed.description, 4096) : null,
    url: typeof embed.url === "string" ? embed.url : null,
    color,
    fields,
    thumbnailUrl: typeof embed.thumbnail?.url === "string" ? embed.thumbnail.url : null,
    imageUrl: typeof embed.image?.url === "string" ? embed.image.url : null,
    footer: embed.footer && typeof embed.footer === "object" && typeof embed.footer.text === "string"
      ? {
          text: cleanText(embed.footer.text, 2048),
          iconUrl: typeof embed.footer.icon_url === "string" ? embed.footer.icon_url : null,
        }
      : null,
    timestamp,
  }
}

function normalizeEmoji(emoji: any): any {
  if (!emoji || typeof emoji !== "object") return null
  const id = typeof emoji.id === "string" ? emoji.id : null
  const name = typeof emoji.name === "string" ? emoji.name : null
  if (!id && !name) return null
  return { id, name, animated: !!emoji.animated }
}

function normalizeButton(comp: any): TranscriptComponent | null {
  if (!comp || typeof comp !== "object") return null
  const style = typeof comp.style === "number" ? comp.style : 2
  return {
    type: "button",
    style,
    label: typeof comp.label === "string" ? cleanText(comp.label, 80) : "",
    emoji: normalizeEmoji(comp.emoji),
    url: typeof comp.url === "string" ? comp.url : null,
    disabled: !!comp.disabled,
  }
}

function normalizeSelectOption(option: any): any {
  if (!option || typeof option !== "object") return null
  return {
    label: typeof option.label === "string" ? cleanText(option.label, 100) : "",
    value: typeof option.value === "string" ? cleanText(option.value, 100) : "",
    description: typeof option.description === "string" ? cleanText(option.description, 100) : null,
    emoji: normalizeEmoji(option.emoji),
    default: !!option.default,
  }
}

function normalizeSelect(comp: any): TranscriptComponent | null {
  if (!comp || typeof comp !== "object") return null
  const options = Array.isArray(comp.options)
    ? comp.options.map(normalizeSelectOption).filter(Boolean).slice(0, 25)
    : []
  return {
    type: "select",
    selectType: typeof comp.type === "number" ? comp.type : 3,
    placeholder: typeof comp.placeholder === "string" ? cleanText(comp.placeholder, 150) : "",
    options,
    disabled: !!comp.disabled,
    minValues: typeof comp.min_values === "number" ? comp.min_values : null,
    maxValues: typeof comp.max_values === "number" ? comp.max_values : null,
  }
}

function normalizeComponent(comp: any, depth: number): TranscriptComponent | null {
  if (!comp || typeof comp !== "object" || depth > 6) return null
  const type = comp.type

  if (type === 1) {
    const components = Array.isArray(comp.components)
      ? comp.components.map((c: any) => normalizeComponent(c, depth + 1)).filter(Boolean).slice(0, 5)
      : []
    return components.length > 0 ? { type: "actionRow", components } : null
  }
  if (type === 2) return normalizeButton(comp)
  if (type >= 3 && type <= 8) return normalizeSelect(comp)
  if (type === 9) {
    const components = Array.isArray(comp.components)
      ? comp.components.map((c: any) => normalizeComponent(c, depth + 1)).filter(Boolean).slice(0, 3)
      : []
    const accessory = comp.accessory ? normalizeComponent(comp.accessory, depth + 1) : null
    return components.length > 0 || accessory ? { type: "section", components, accessory } : null
  }
  if (type === 10) {
    const content = typeof comp.content === "string" ? cleanText(comp.content, 4000) : ""
    return content ? { type: "text", content } : null
  }
  if (type === 11) {
    const media = comp.media || {}
    return typeof media.url === "string" ? { type: "thumbnail", url: media.url, description: typeof media.description === "string" ? media.description : null, spoiler: !!comp.spoiler } : null
  }
  if (type === 12) {
    const items = Array.isArray(comp.items)
      ? comp.items.slice(0, 10).map((item: any) => ({ url: typeof item.media?.url === "string" ? item.media.url : "", description: typeof item.media?.description === "string" ? item.media.description : null, spoiler: !!item.spoiler })).filter((i: any) => i.url)
      : []
    return items.length > 0 ? { type: "media", items } : null
  }
  if (type === 13) {
    const file = comp.file || {}
    return typeof file.url === "string" ? { type: "file", url: file.url, name: typeof file.name === "string" ? file.name.slice(0, 255) : "fichier", size: typeof file.size === "number" ? file.size : null, spoiler: !!comp.spoiler } : null
  }
  if (type === 14) {
    return { type: "separator", divider: comp.divider !== false, spacing: typeof comp.spacing === "number" ? comp.spacing : 1 }
  }
  if (type === 17) {
    const components = Array.isArray(comp.components)
      ? comp.components.map((c: any) => normalizeComponent(c, depth + 1)).filter(Boolean).slice(0, 10)
      : []
    return components.length > 0 ? { type: "container", accentColor: typeof comp.accent_color === "number" && comp.accent_color >= 0 ? `#${comp.accent_color.toString(16).padStart(6, "0")}` : null, spoiler: !!comp.spoiler, components } : null
  }
  return null
}

function normalizePoll(poll: any): TranscriptPoll | null {
  if (!poll || typeof poll !== "object") return null
  const answers: TranscriptPollAnswer[] = Array.isArray(poll.answers)
    ? poll.answers.slice(0, 10).map((answer: any) => ({
        text: typeof answer.poll_media?.text === "string" ? cleanText(answer.poll_media.text, 100) : "",
        emoji: normalizeEmoji(answer.poll_media?.emoji),
        voteCount: typeof answer.vote_count === "number" ? answer.vote_count : 0,
        me: !!answer.me_vote,
      }))
    : []
  return {
    question: typeof poll.question?.text === "string" ? cleanText(poll.question.text, 300) : "",
    answers,
    totalVotes: typeof poll.results?.total_votes === "number" ? poll.results.total_votes : answers.reduce((a, b) => a + b.voteCount, 0),
    multiple: !!poll.allow_multiselect,
    expired: !!poll.results?.is_finalized,
    durationHours: typeof poll.duration === "number" ? poll.duration : null,
  }
}

function normalizeReaction(reaction: RawReaction): TranscriptReaction | null {
  if (!reaction?.emoji) return null
  const emoji = normalizeEmoji(reaction.emoji)
  if (!emoji) return null
  const count = typeof reaction.count === "number" ? reaction.count : reaction.count_details?.normal ?? 0
  return { emoji, count: count < 0 ? 0 : count, me: !!reaction.me }
}

function normalizeSticker(sticker: any): TranscriptSticker | null {
  if (!sticker || typeof sticker !== "object") return null
  const id = typeof sticker.id === "string" ? sticker.id : ""
  const name = typeof sticker.name === "string" ? sticker.name : ""
  if (!id) return null
  return { id, name, format: typeof sticker.format_type === "number" ? sticker.format_type : 1, url: stickerUrl(sticker) }
}

function normalizeReply(message: RawMessage, profiles: Record<string, TranscriptProfile>): TranscriptReply | null {
  const ref = message.referenced_message
  if (!ref) return null
  const authorId = ref.author?.id && /^\d{17,20}$/.test(ref.author.id) ? ref.author.id : null
  if (authorId && !profiles[authorId]) {
    profiles[authorId] = buildProfile(authorId, ref.author, ref.member, null, [])
  }
  const attachments = Array.isArray(ref.attachments) ? ref.attachments : []
  return {
    messageId: typeof ref.id === "string" ? ref.id : "",
    authorId,
    content: typeof ref.content === "string" ? cleanText(ref.content, 500) : "",
    attachmentName: attachments[0]?.filename ?? null,
    deleted: false,
  }
}

function normalizeForwarded(snapshot: any, profiles: Record<string, TranscriptProfile>): TranscriptForwardedMessage | null {
  const msg = snapshot?.message
  if (!msg || typeof msg !== "object") return null
  const authorId = msg.author?.id && /^\d{17,20}$/.test(msg.author.id) ? msg.author.id : null
  if (authorId && !profiles[authorId]) {
    profiles[authorId] = buildProfile(authorId, msg.author, msg.member, null, [])
  }
  const embeds = Array.isArray(msg.embeds) ? msg.embeds.map(normalizeEmbed).filter(Boolean).slice(0, 10) : []
  const attachments = Array.isArray(msg.attachments) ? msg.attachments.slice(0, 10).map((a: any) => normalizeAttachment(a, null)) : []
  return {
    authorId,
    content: typeof msg.content === "string" ? cleanText(msg.content, 4000) : "",
    createdAt: parseTimestamp(msg.timestamp),
    embeds,
    attachments,
  }
}

export interface NormalizeOptions {
  channel: RawChannel
  guild?: RawGuild | null
  roles?: RawRole[]
  members?: Map<string, any>
  bot?: { id: string; username: string; avatar?: string | null } | null
  messages: RawMessage[]
  inlineAssets?: Map<string, string>
}

export function normalizeTranscript(options: NormalizeOptions): TranscriptPayload {
  const profiles: Record<string, TranscriptProfile> = {}
  const roleMap: Record<string, TranscriptRole> = {}
  const channelMap: Record<string, { id: string; name: string }> = {}

  const roles = Array.isArray(options.roles) ? options.roles : []
  for (const role of roles) {
    if (!role?.id || !/^\d{17,20}$/.test(role.id)) continue
    roleMap[role.id] = {
      id: role.id,
      name: typeof role.name === "string" ? role.name.slice(0, 100) : "role",
      color: roleColor(role.color, role.colors),
      position: typeof role.position === "number" ? role.position : 0,
    }
  }

  if (options.guild?.id && options.guild.name) {
    channelMap[options.guild.id] = { id: options.guild.id, name: options.guild.name }
  }
  if (options.channel?.parent_id) channelMap[options.channel.parent_id] = { id: options.channel.parent_id, name: "Catégorie" }

  const normalizedMessages: TranscriptMessage[] = []

  for (const raw of options.messages) {
    if (!raw?.id || !raw.author?.id) continue
    if (!/^\d{17,20}$/.test(raw.id) || !/^\d{17,20}$/.test(raw.author.id)) continue

    const authorId = raw.author.id
    const memberRoles = Array.isArray(raw.member?.roles) ? toSnowflakeArray(raw.member.roles).filter((id) => roleMap[id]) : []
    const color = memberRoles.map((id) => roleMap[id]).sort((a, b) => b.position - a.position).find((r) => r.color)?.color ?? null

    if (!profiles[authorId]) {
      profiles[authorId] = buildProfile(authorId, raw.author, raw.member, color, memberRoles)
    } else if (color && !profiles[authorId].color) {
      profiles[authorId] = { ...profiles[authorId], color }
    }

    for (const mention of Array.isArray(raw.mentions) ? raw.mentions : []) {
      if (mention?.id && /^\d{17,20}$/.test(mention.id) && !profiles[mention.id]) {
        profiles[mention.id] = buildProfile(mention.id, mention, null, null, [])
      }
    }

    const embeds = Array.isArray(raw.embeds)
      ? (raw.embeds.map(normalizeEmbed).filter((e): e is NonNullable<typeof e> => e !== null)).slice(0, 10)
      : []
    const attachments = Array.isArray(raw.attachments)
      ? raw.attachments.slice(0, 10).map((att) => normalizeAttachment(att, options.inlineAssets?.get(att.id) ?? options.inlineAssets?.get(att.url) ?? null))
      : []
    const components = Array.isArray(raw.components)
      ? (raw.components.map((c) => normalizeComponent(c, 0)).filter((c): c is NonNullable<typeof c> => c !== null)).slice(0, 5)
      : []
    const reactions = Array.isArray(raw.reactions)
      ? (raw.reactions.map(normalizeReaction).filter((r): r is NonNullable<typeof r> => r !== null)).slice(0, 50)
      : []
    const stickers = Array.isArray(raw.sticker_items)
      ? (raw.sticker_items.map(normalizeSticker).filter((s): s is NonNullable<typeof s> => s !== null)).slice(0, 3)
      : []
    const poll = normalizePoll(raw.poll)
    const interaction: TranscriptInteraction | null = raw.interaction?.name
      ? { name: cleanText(raw.interaction.name, 32), type: typeof raw.interaction.type === "number" ? raw.interaction.type : 0, userId: raw.interaction.user?.id ?? null }
      : null
    const forwarded = Array.isArray(raw.message_snapshots)
      ? (raw.message_snapshots.map((snap) => normalizeForwarded(snap, profiles)).filter((f): f is NonNullable<typeof f> => f !== null)).slice(0, 5)
      : []

    const reply = raw.referenced_message ? normalizeReply(raw, profiles) : null
    if (reply?.messageId && /^\d{17,20}$/.test(reply.messageId)) {
      // reply only references
    }

    const type = typeof raw.type === "number" ? raw.type : 0
    const system = type !== 0 && type !== 19 && type !== 20 && type !== 23

    normalizedMessages.push({
      id: raw.id,
      authorId,
      content: typeof raw.content === "string" ? raw.content : "",
      createdAt: parseTimestamp(raw.timestamp) ?? Date.now(),
      editedAt: parseTimestamp(raw.edited_timestamp),
      system,
      pinned: !!raw.pinned,
      type,
      webhook: !!raw.webhook_id,
      reply,
      embeds,
      attachments,
      components,
      reactions,
      stickers,
      poll,
      interaction,
      forwarded,
    })
  }

  return {
    version: TRANSCRIPT_VERSION,
    guild: options.guild?.id && options.guild.name
      ? { id: options.guild.id, name: options.guild.name, iconUrl: guildIconUrl(options.guild) }
      : null,
    channel: {
      id: options.channel.id,
      name: typeof options.channel.name === "string" ? options.channel.name : "inconnu",
      topic: typeof options.channel.topic === "string" ? options.channel.topic.slice(0, 1024) : null,
      type: typeof options.channel.type === "number" ? options.channel.type : 0,
      parentName: null,
    },
    bot: options.bot ? { id: options.bot.id, name: options.bot.username, avatarUrl: options.bot.avatar ?? null } : null,
    profiles,
    roles: roleMap,
    channels: channelMap,
    messages: normalizedMessages,
  }
}
