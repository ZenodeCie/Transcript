import type {
  TranscriptComponent,
  TranscriptContainer,
  TranscriptFile,
  TranscriptMediaGallery,
  TranscriptSection,
  TranscriptSelect,
  TranscriptSelectOption,
  TranscriptThumbnail,
} from "../shared/types.js"
import { escapeHtml, humanFileSize, safeExternalUrl, safeMediaUrl } from "./html.js"
import { renderEmoji } from "./emoji.js"
import { renderMarkdown } from "./markdown.js"
import type { RenderContext } from "./context.js"

const MAX_DEPTH = 6
const MAX_SELECT_OPTIONS = 25
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i

const BUTTON_STYLES: Record<number, string> = {
  1: "primary",
  2: "secondary",
  3: "success",
  4: "danger",
  5: "link",
}

const SELECT_HINTS: Record<number, string> = {
  5: "Sélectionner un utilisateur",
  6: "Sélectionner un rôle",
  7: "Sélectionner un membre ou un rôle",
  8: "Sélectionner un salon",
}

function renderOption(option: TranscriptSelectOption): string {
  const emoji = option.emoji ? renderEmoji(option.emoji, "select-emoji") : ""
  const description = option.description
    ? `<span class="select-option-description">${escapeHtml(option.description)}</span>`
    : ""
  return `<div class="select-option${option.default ? " is-default" : ""}"><span class="select-option-label">${emoji}${escapeHtml(option.label)}</span>${description}</div>`
}

function renderSelect(select: TranscriptSelect): string {
  const hint = select.placeholder || SELECT_HINTS[select.selectType] || "Sélectionner…"
  const options = select.options.slice(0, MAX_SELECT_OPTIONS).map(renderOption).join("")
  const optionsBlock = options ? `<div class="select-options">${options}</div>` : ""
  return `<div class="dc-select${select.disabled ? " disabled" : ""}"><div class="select-placeholder">${escapeHtml(hint)}</div>${optionsBlock}</div>`
}

function renderThumbnail(thumbnail: TranscriptThumbnail): string {
  const url = safeMediaUrl(thumbnail.url)
  if (!url) return ""
  const alt = thumbnail.description ? escapeHtml(thumbnail.description) : ""
  return `<img class="dc-thumbnail${thumbnail.spoiler ? " spoiler-media" : ""}" src="${escapeHtml(url)}" alt="${alt}" loading="lazy">`
}

function renderMedia(gallery: TranscriptMediaGallery): string {
  const items = gallery.items
    .map((item) => {
      const url = safeMediaUrl(item.url)
      if (!url) return ""
      const alt = item.description ? escapeHtml(item.description) : ""
      const image = `<img class="dc-media-item${item.spoiler ? " spoiler-media" : ""}" src="${escapeHtml(url)}" alt="${alt}" loading="lazy">`
      return `<a class="dc-media-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${image}</a>`
    })
    .join("")
  return items ? `<div class="dc-media-gallery">${items}</div>` : ""
}

function renderFile(file: TranscriptFile): string {
  const url = safeMediaUrl(file.url)
  if (!url) return ""
  const size = humanFileSize(file.size)
  const meta = size ? `<span class="file-size">${size}</span>` : ""
  return `<a class="attachment-file${file.spoiler ? " spoiler-media" : ""}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow"${url.startsWith("data:") ? ` download="${escapeHtml(file.name)}"` : ""}><span class="file-icon">📎</span><span class="file-name">${escapeHtml(file.name)}</span>${meta}</a>`
}

function renderContainer(container: TranscriptContainer, ctx: RenderContext, depth: number): string {
  const children = container.components.map((child) => renderComponent(child, ctx, depth + 1)).join("")
  if (!children) return ""
  const color = container.accentColor && COLOR_PATTERN.test(container.accentColor) ? container.accentColor : null
  const style = color ? ` style="border-left-color:${color}"` : ""
  const spoiler = container.spoiler ? " spoiler" : ""
  return `<div class="dc-container${spoiler}"${style}>${children}</div>`
}

function renderSection(section: TranscriptSection, ctx: RenderContext, depth: number): string {
  const content = section.components.map((component) => renderComponent(component, ctx, depth + 1)).join("")
  const accessory = section.accessory ? renderComponent(section.accessory, ctx, depth + 1) : ""
  const accessoryBlock = accessory ? `<div class="dc-section-accessory">${accessory}</div>` : ""
  if (!content && !accessoryBlock) return ""
  return `<div class="dc-section"><div class="dc-section-content">${content}</div>${accessoryBlock}</div>`
}

function renderComponent(component: TranscriptComponent, ctx: RenderContext, depth: number): string {
  if (depth > MAX_DEPTH) return ""

  switch (component.type) {
    case "actionRow": {
      const children = component.components
        .filter((child) => child.type === "button" || child.type === "select")
        .map((child) => renderComponent(child, ctx, depth + 1))
        .join("")
      return children ? `<div class="dc-action-row">${children}</div>` : ""
    }
    case "button": {
      const emoji = component.emoji ? renderEmoji(component.emoji, "button-emoji") : ""
      const label = component.label ? `<span class="button-label">${escapeHtml(component.label)}</span>` : ""
      const content = `${emoji}${label}`
      if (!content) return ""
      const url = component.url && component.style === 5 ? safeExternalUrl(component.url) : null
      if (url) {
        return `<a class="dc-button dc-button-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${content}</a>`
      }
      const style = BUTTON_STYLES[component.style] ?? "secondary"
      return `<span class="dc-button dc-button-${style}${component.disabled ? " disabled" : ""}" aria-disabled="true">${content}</span>`
    }
    case "select":
      return renderSelect(component)
    case "text":
      return component.content ? `<div class="dc-text">${renderMarkdown(component.content, ctx)}</div>` : ""
    case "thumbnail":
      return renderThumbnail(component)
    case "media":
      return renderMedia(component)
    case "file":
      return renderFile(component)
    case "separator": {
      const spacing = component.spacing === 2 ? "large" : "small"
      return component.divider
        ? `<hr class="dc-separator ${spacing}">`
        : `<div class="dc-separator-space ${spacing}"></div>`
    }
    case "section":
      return renderSection(component, ctx, depth)
    case "container":
      return renderContainer(component, ctx, depth)
    default:
      return ""
  }
}

export function renderComponents(components: TranscriptComponent[], ctx: RenderContext): string {
  if (components.length === 0) return ""
  const html = components.map((component) => renderComponent(component, ctx, 0)).join("")
  return html ? `<div class="components">${html}</div>` : ""
}
