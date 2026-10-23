import type { TranscriptEmbed } from "../shared/types.js"
import { escapeHtml, renderTime, safeExternalUrl } from "./html.js"
import { renderMarkdown } from "./markdown.js"
import type { RenderContext } from "./context.js"

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function embedColor(embed: TranscriptEmbed): string | null {
  return embed.color && COLOR_PATTERN.test(embed.color) ? embed.color : null
}

function renderEmbedAuthor(embed: TranscriptEmbed): string {
  if (!embed.author) return ""
  const icon = safeExternalUrl(embed.author.iconUrl)
  const url = safeExternalUrl(embed.author.url)
  const name = escapeHtml(embed.author.name)
  const label = url
    ? `<a class="embed-author-name" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${name}</a>`
    : `<span class="embed-author-name">${name}</span>`
  const image = icon
    ? `<img class="embed-author-icon" src="${escapeHtml(icon)}" alt="" loading="lazy">`
    : ""
  return `<div class="embed-author">${image}${label}</div>`
}

function renderEmbedFooter(embed: TranscriptEmbed): string {
  const footer = embed.footer
  if (!footer && embed.timestamp === null) return ""
  const icon = footer ? safeExternalUrl(footer.iconUrl) : null
  const image = icon ? `<img class="embed-footer-icon" src="${escapeHtml(icon)}" alt="" loading="lazy">` : ""
  const text = footer ? `<span>${escapeHtml(footer.text)}</span>` : ""
  const timestamp = embed.timestamp !== null ? renderTime(embed.timestamp, "embed-timestamp") : ""
  return `<div class="embed-footer">${image}${text}${timestamp}</div>`
}

export function renderEmbed(embed: TranscriptEmbed, ctx: RenderContext): string {
  const description = embed.description ? renderMarkdown(embed.description, ctx) : ""
  const titleUrl = safeExternalUrl(embed.url)
  const title = embed.title
    ? titleUrl
      ? `<a class="embed-title" href="${escapeHtml(titleUrl)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(embed.title)}</a>`
      : `<div class="embed-title">${escapeHtml(embed.title)}</div>`
    : ""

  const fields = embed.fields
    .filter((field) => field.name.length > 0 || field.value.length > 0)
    .map(
      (field) =>
        `<div class="embed-field${field.inline ? " inline" : ""}"><div class="embed-field-name">${escapeHtml(field.name)}</div><div class="embed-field-value">${renderMarkdown(field.value, ctx)}</div></div>`,
    )
    .join("")
  const fieldsBlock = fields ? `<div class="embed-fields">${fields}</div>` : ""

  const thumbnail = safeExternalUrl(embed.thumbnailUrl)
  const thumbnailBlock = thumbnail
    ? `<img class="embed-thumbnail" src="${escapeHtml(thumbnail)}" alt="" loading="lazy">`
    : ""

  const image = safeExternalUrl(embed.imageUrl)
  const imageBlock = image
    ? `<img class="embed-image" src="${escapeHtml(image)}" alt="" loading="lazy">`
    : ""

  const body = `${renderEmbedAuthor(embed)}${title}${description ? `<div class="embed-description">${description}</div>` : ""}${fieldsBlock}${imageBlock}${renderEmbedFooter(embed)}`
  if (!body) return ""

  const color = embedColor(embed)
  const style = color ? ` style="border-left-color:${color}"` : ""

  return `<div class="embed"${style}><div class="embed-main">${body}</div>${thumbnailBlock}</div>`
}

export function renderEmbeds(embeds: TranscriptEmbed[], ctx: RenderContext): string {
  if (embeds.length === 0) return ""
  return `<div class="embeds">${embeds.map((embed) => renderEmbed(embed, ctx)).join("")}</div>`
}
