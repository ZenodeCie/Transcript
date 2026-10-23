import type {
  TranscriptAttachment,
  TranscriptEmbed,
  TranscriptForwardedMessage,
  TranscriptMessage,
  TranscriptPoll,
  TranscriptProfile,
  TranscriptReaction,
  TranscriptSticker,
} from "../shared/types.js"
import { escapeHtml, humanFileSize, renderTime, safeExternalUrl, safeMediaUrl, truncateText } from "./html.js"
import { renderEmoji } from "./emoji.js"
import { renderMarkdown, plainPreview } from "./markdown.js"
import { renderEmbeds } from "./embeds.js"
import { renderComponents } from "./components.js"
import { displayNameOf, profileOf } from "./context.js"
import type { RenderContext } from "./context.js"

const SYSTEM_LABELS: Record<number, string> = {
  1: "a ajouté un destinataire au groupe.",
  2: "a retiré un destinataire du groupe.",
  3: "a démarré un appel.",
  4: "a renommé le salon.",
  5: "a changé l'icône du salon.",
  6: "a épinglé un message.",
  7: "a rejoint le serveur.",
  8: "a boosté le serveur.",
  9: "a boosté le serveur au niveau 1.",
  10: "a boosté le serveur au niveau 2.",
  11: "a boosté le serveur au niveau 3.",
  12: "a suivi un salon d'annonces.",
  14: "a activé la découverte du serveur.",
  15: "la période de grâce de la découverte a commencé.",
  16: "le serveur a été disqualifié de la découverte.",
  17: "le serveur a été requalifié pour la découverte.",
  18: "a créé un fil.",
  23: "a déclenché une action d'auto-modération.",
  24: "a acheté un abonnement de rôle.",
  25: "a interagi avec une promotion.",
  26: "a démarré une scène.",
  27: "a terminé une scène.",
  28: "a rejoint la scène en tant qu'intervenant.",
  29: "a changé le sujet de la scène.",
  31: "a levé la main.",
  32: "a baissé la main.",
}

function anchorId(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64)
  return sanitized || "message"
}

function profileColor(profile: TranscriptProfile): string | null {
  return profile.color && /^#[0-9a-f]{6}$/i.test(profile.color) ? profile.color : null
}

function renderAvatar(profile: TranscriptProfile): string {
  const url = safeExternalUrl(profile.avatarUrl)
  if (url) {
    return `<img class="avatar" src="${escapeHtml(url)}" alt="" loading="lazy">`
  }
  const color = profileColor(profile) ?? "#5865f2"
  const initial = escapeHtml(Array.from(profile.displayName)[0] ?? "?")
  return `<span class="avatar avatar-fallback" style="background:${color}" aria-hidden="true">${initial}</span>`
}

function renderBadges(profile: TranscriptProfile): string {
  const bot = profile.bot ? `<span class="badge badge-bot" title="Bot">BOT</span>` : ""
  const verified = profile.verified
    ? `<span class="badge badge-verified" title="Bot vérifié" aria-label="Bot vérifié">✓</span>`
    : ""
  return `${bot}${verified}`
}

function renderReply(message: TranscriptMessage, ctx: RenderContext): string {
  const reply = message.reply
  if (!reply) return ""
  const target = `#m-${anchorId(reply.messageId)}`

  if (reply.deleted) {
    return `<a class="reply reply-deleted" href="${escapeHtml(target)}"><span class="reply-content">Message original supprimé</span></a>`
  }

  const author = displayNameOf(ctx, reply.authorId)
  const preview = plainPreview(reply.content, 90) || (reply.attachmentName ? `📎 ${reply.attachmentName}` : "Message original")
  return `<a class="reply" href="${escapeHtml(target)}"><span class="reply-author">@${escapeHtml(author)}</span><span class="reply-content">${escapeHtml(preview)}</span></a>`
}

function renderInteraction(message: TranscriptMessage): string {
  if (!message.interaction?.name) return ""
  return `<div class="interaction">a utilisé <code>/${escapeHtml(message.interaction.name)}</code></div>`
}

function attachmentSpoiler(attachment: TranscriptAttachment): boolean {
  return attachment.name.toLowerCase().startsWith("spoiler_")
}

function renderAttachments(attachments: TranscriptAttachment[]): string {
  const images: string[] = []
  const others: string[] = []

  for (const attachment of attachments) {
    const url = safeMediaUrl(attachment.inlineDataUrl) ?? safeMediaUrl(attachment.url)
    if (!url) continue
    const spoiler = attachmentSpoiler(attachment)
    const spoilerClass = spoiler ? " spoiler-media" : ""
    const alt = escapeHtml(attachment.name)

    if (attachment.isImage) {
      images.push(
        `<a class="attachment-image-link${spoilerClass}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow" data-lightbox="${escapeHtml(url)}"><img class="attachment-image" src="${escapeHtml(url)}" alt="${alt}" loading="lazy"></a>`,
      )
      continue
    }

    if (attachment.isVideo) {
      others.push(
        `<video class="attachment-video${spoilerClass}" controls preload="metadata" src="${escapeHtml(url)}"></video>`,
      )
      continue
    }

    if (attachment.isAudio) {
      others.push(
        `<audio class="attachment-audio${spoilerClass}" controls preload="metadata" src="${escapeHtml(url)}"></audio>`,
      )
      continue
    }

    const size = humanFileSize(attachment.size)
    const meta = size ? `<span class="file-size">${size}</span>` : ""
    const download = url.startsWith("data:") ? ` download="${alt}"` : ""
    others.push(
      `<a class="attachment-file${spoilerClass}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow"${download}><span class="file-icon">📎</span><span class="file-name">${alt}</span>${meta}</a>`,
    )
  }

  const imageBlock = images.length > 0 ? `<div class="attachment-grid">${images.join("")}</div>` : ""
  return `${imageBlock}${others.join("")}`
}

function renderStickers(stickers: TranscriptSticker[]): string {
  if (stickers.length === 0) return ""
  const items = stickers
    .map((sticker) => {
      const url = safeExternalUrl(sticker.url)
      if (url) {
        return `<img class="sticker" src="${escapeHtml(url)}" alt="${escapeHtml(sticker.name)}" loading="lazy">`
      }
      return `<span class="sticker sticker-name">:${escapeHtml(sticker.name)}:</span>`
    })
    .join("")
  return `<div class="stickers">${items}</div>`
}

function renderPoll(poll: TranscriptPoll): string {
  const total = poll.totalVotes
  const answers = poll.answers
    .map((answer) => {
      const ratio = total > 0 ? Math.round((answer.voteCount / total) * 100) : 0
      const emoji = answer.emoji ? renderEmoji(answer.emoji, "poll-emoji") : ""
      return `<div class="poll-answer${answer.me ? " is-voted" : ""}"><div class="poll-bar" style="width:${ratio}%"></div><div class="poll-answer-content">${emoji}<span>${escapeHtml(answer.text)}</span><span class="poll-count">${answer.voteCount} (${ratio}%)</span></div></div>`
    })
    .join("")
  const meta = `${total} vote${total > 1 ? "s" : ""}${poll.multiple ? " • choix multiple" : ""}${poll.expired ? " • sondage terminé" : ""}`
  return `<div class="poll"><div class="poll-question">${escapeHtml(poll.question)}</div>${answers}<div class="poll-meta">${escapeHtml(meta)}</div></div>`
}

function renderReactions(reactions: TranscriptReaction[]): string {
  if (reactions.length === 0) return ""
  const items = reactions
    .map(
      (reaction) =>
        `<span class="reaction${reaction.me ? " is-me" : ""}">${renderEmoji(reaction.emoji, "reaction-emoji")}<span class="reaction-count">${reaction.count}</span></span>`,
    )
    .join("")
  return `<div class="reactions">${items}</div>`
}

function renderForwarded(forwarded: TranscriptForwardedMessage[], ctx: RenderContext): string {
  if (forwarded.length === 0) return ""
  const items = forwarded
    .map((forward) => {
      const author = forward.authorId ? displayNameOf(ctx, forward.authorId) : "Auteur inconnu"
      const content = forward.content ? `<div class="forwarded-content">${renderMarkdown(forward.content, ctx)}</div>` : ""
      const embeds = renderEmbeds(forward.embeds, ctx)
      const attachments = renderAttachments(forward.attachments)
      return `<div class="forwarded-message"><div class="forwarded-author">@${escapeHtml(author)}${forward.createdAt !== null ? ` • ${renderTime(forward.createdAt)}` : ""}</div>${content}${embeds}${attachments}</div>`
    })
    .join("")
  return `<div class="forwarded"><div class="forwarded-label">Message transféré</div>${items}</div>`
}

function systemText(message: TranscriptMessage, ctx: RenderContext): string {
  if (message.content) return renderMarkdown(message.content, ctx)
  const author = displayNameOf(ctx, message.authorId)
  const label = SYSTEM_LABELS[message.type] ?? "a déclenché un événement système."
  return `${escapeHtml(author)} ${escapeHtml(label)}`
}

function searchText(message: TranscriptMessage, ctx: RenderContext): string {
  const parts: string[] = [displayNameOf(ctx, message.authorId), message.content]
  for (const embed of message.embeds) {
    if (embed.title) parts.push(embed.title)
    if (embed.description) parts.push(embed.description)
    for (const field of embed.fields) parts.push(field.name, field.value)
  }
  for (const attachment of message.attachments) parts.push(attachment.name)
  for (const forward of message.forwarded) parts.push(forward.content)
  if (message.poll) parts.push(message.poll.question)
  if (message.interaction) parts.push(message.interaction.name)
  return truncateText(plainPreview(parts.join(" "), 4000).toLowerCase(), 4000)
}

export function renderMessage(message: TranscriptMessage, ctx: RenderContext): string {
  const profile = profileOf(ctx, message.authorId)
  const color = profileColor(profile)
  const colorStyle = color ? ` style="color:${color}"` : ""
  const edited = message.editedAt !== null ? `<span class="edited">(modifié)</span>` : ""
  const pinned = message.pinned ? `<span class="pinned" title="Message épinglé">épinglé</span>` : ""
  const anchor = anchorId(message.id)

  const content = message.system
    ? `<div class="message-content system-content">${systemText(message, ctx)}</div>`
    : message.content
      ? `<div class="message-content">${renderMarkdown(message.content, ctx)}</div>`
      : ""

  const embeds = renderEmbeds(message.embeds, ctx)
  const attachments = renderAttachments(message.attachments)
  const components = renderComponents(message.components, ctx)

  return `<article class="message${message.system ? " system" : ""}${message.pinned ? " is-pinned" : ""}" id="m-${anchor}" data-search="${escapeHtml(searchText(message, ctx))}">
  ${renderAvatar(profile)}
  <div class="message-body">
    <div class="message-header">
      <span class="author"${colorStyle}>${escapeHtml(profile.displayName)}</span>
      ${renderBadges(profile)}
      ${renderTime(message.createdAt, "timestamp")}
      ${edited}
      ${pinned}
      <a class="message-link" href="#m-${anchor}" title="Lien vers ce message" aria-label="Lien vers ce message">#</a>
    </div>
    ${renderReply(message, ctx)}
    ${renderInteraction(message)}
    ${renderForwarded(message.forwarded, ctx)}
    ${content}
    ${embeds}
    ${attachments}
    ${components}
    ${renderStickers(message.stickers)}
    ${message.poll ? renderPoll(message.poll) : ""}
    ${renderReactions(message.reactions)}
  </div>
</article>`
}

export function renderMessages(messages: TranscriptMessage[], ctx: RenderContext): string {
  if (messages.length === 0) {
    return `<div class="empty-state">Aucun message dans ce transcript.</div>`
  }
  return messages.map((message) => renderMessage(message, ctx)).join("\n")
}
