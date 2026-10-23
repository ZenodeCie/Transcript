import { escapeHtml, renderDiscordTimestamp, safeExternalUrl } from "./html.js"
import { customEmoji } from "./emoji.js"
import type { RenderContext } from "./context.js"

const USER_MENTION = /<@!?(\d{17,20})>/g
const ROLE_MENTION = /<@&(\d{17,20})>/g
const CHANNEL_MENTION = /<#(\d{17,20})>/g
const TIMESTAMP = /<t:(\d{1,12})(?::([tTdDfFR]))?>/g
const CUSTOM_EMOJI = /<(a?):([A-Za-z0-9_~]{1,64}):(\d{17,20})>/g
const EVERYONE = /(?<![\w@])@(everyone|here)\b/g
const MASKED_LINK = /\[([^\]\n]{1,300})\]\((https?:\/\/[^\s)]+)\)/g
const BARE_URL = /\bhttps?:\/\/[^\s<>"'`]+/g
const PLACEHOLDER = /\u0000(\d+)\u0000/g

const UNSAFE_MARKERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

interface Registry {
  add(html: string): string
  restore(text: string): string
}

function createRegistry(): Registry {
  const items: string[] = []
  return {
    add(html: string): string {
      const index = items.push(html) - 1
      return `\u0000${index}\u0000`
    },
    restore(text: string): string {
      return text.replace(PLACEHOLDER, (_match, index: string) => items[Number(index)] ?? "")
    },
  }
}

function renderCodeBlock(language: string, code: string): string {
  const lang = /^[a-z0-9+#._-]{1,24}$/i.test(language) ? language : ""
  const classAttribute = lang ? ` class="language-${escapeHtml(lang)}"` : ""
  return `<pre class="md-codeblock"><code${classAttribute}>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`
}

function renderLink(label: string, url: string): string | null {
  const href = safeExternalUrl(url)
  if (!href) return null
  return `<a class="md-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(label)}</a>`
}

function trimUrlPunctuation(value: string): string {
  let url = value
  while (/[.,;:!?]$/.test(url)) url = url.slice(0, -1)
  while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1)
  }
  return url
}

/**
 * Discord-flavored markdown renderer. Everything is escaped first; the only HTML emitted
 * comes from this module. URLs are restricted to http(s), code blocks never interpret HTML.
 */
export function renderMarkdown(input: string, ctx: RenderContext): string {
  const registry = createRegistry()
  let text = input.replace(UNSAFE_MARKERS, "").replace(/\r\n?/g, "\n")

  // Code first: its content must never be parsed as markdown.
  text = text.replace(/```([a-zA-Z0-9+#._-]{0,24})\n?([\s\S]*?)```/g, (_match, language: string, code: string) =>
    registry.add(renderCodeBlock(language, code)),
  )
  text = text.replace(/`([^`\n]+)`/g, (_match, code: string) => registry.add(`<code class="md-code">${escapeHtml(code)}</code>`))

  text = text.replace(USER_MENTION, (_match, id: string) => {
    const profile = ctx.profiles[id]
    const name = profile?.displayName ?? id
    return registry.add(
      `<span class="mention mention-user" data-user-id="${escapeHtml(id)}">@${escapeHtml(name)}</span>`,
    )
  })

  text = text.replace(ROLE_MENTION, (_match, id: string) => {
    const role = ctx.roles[id]
    const name = role?.name ?? id
    const color = role?.color ? ` style="color:${role.color}"` : ""
    return registry.add(
      `<span class="mention mention-role"${color} data-role-id="${escapeHtml(id)}">@${escapeHtml(name)}</span>`,
    )
  })

  text = text.replace(CHANNEL_MENTION, (_match, id: string) => {
    const channel = ctx.channels[id]
    const name = channel?.name ?? id
    return registry.add(
      `<span class="mention mention-channel" data-channel-id="${escapeHtml(id)}">#${escapeHtml(name)}</span>`,
    )
  })

  text = text.replace(EVERYONE, (_match, name: string) =>
    registry.add(`<span class="mention mention-everyone">@${escapeHtml(name)}</span>`),
  )

  text = text.replace(TIMESTAMP, (_match, seconds: string, style: string | undefined) => {
    const unix = Number(seconds)
    if (!Number.isFinite(unix) || unix < 946_684_800 || unix > 4_102_444_800) {
      return _match
    }
    return registry.add(renderDiscordTimestamp(unix, style ?? null))
  })

  text = text.replace(CUSTOM_EMOJI, (match, animated: string, name: string, id: string) => {
    const rendered = customEmoji(name, id, animated === "a")
    return rendered ? registry.add(rendered) : match
  })

  text = text.replace(MASKED_LINK, (match, label: string, url: string) => {
    const rendered = renderLink(label, url)
    return rendered ? registry.add(rendered) : match
  })

  text = text.replace(BARE_URL, (match) => {
    const url = trimUrlPunctuation(match)
    const rendered = renderLink(url, url)
    return rendered ? registry.add(rendered) : match
  })

  text = escapeHtml(text)

  // Inline formatting (applied to escaped text; placeholders are opaque).
  text = text.replace(/\*\*\*([^*\n]+?)\*\*\*/g, "<strong><em>$1</em></strong>")
  text = text.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
  text = text.replace(/__([^_\n]+?)__/g, "<u>$1</u>")
  text = text.replace(/~~([^~\n]+?)~~/g, "<s>$1</s>")
  text = text.replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
  text = text.replace(/(?<![\p{L}\p{N}_])_([^_\n]+?)_(?![\p{L}\p{N}_])/gu, "<em>$1</em>")
  text = text.replace(/\|\|([\s\S]+?)\|\|/g, '<span class="spoiler" tabindex="0" role="button">$1</span>')

  const lines = text.split("\n")
  const parts: string[] = []
  let quote: string[] = []

  const flushQuote = (): void => {
    if (quote.length === 0) return
    parts.push(`<blockquote class="md-quote">${quote.join("<br>")}</blockquote>`)
    quote = []
  }

  for (const line of lines) {
    const quoteMatch = /^&gt;\s?(.*)$/.exec(line)
    if (quoteMatch) {
      quote.push(quoteMatch[1] ?? "")
      continue
    }
    flushQuote()

    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1]?.length ?? 1
      parts.push(`<div class="md-heading md-h${level}">${heading[2] ?? ""}</div>`)
      continue
    }

    const subtext = /^-#\s+(.+)$/.exec(line)
    if (subtext) {
      parts.push(`<span class="md-subtext">${subtext[1] ?? ""}</span>`)
      continue
    }

    parts.push(line)
  }
  flushQuote()

  const output = parts.join("<br>").replace(/(?:<br>)+$/, "")
  return registry.restore(output)
}

/** Short, formatting-free preview used for replies and search data. */
export function plainPreview(input: string, maxLength: number): string {
  const compact = input.replace(/\s+/g, " ").trim()
  const withoutMarkdown = compact
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<@!?(\d+)>/g, "@utilisateur")
    .replace(/<@&(\d+)>/g, "@rôle")
    .replace(/<#(\d+)>/g, "#salon")
    .replace(/<t:\d+(?::[tTdDfFR])?>/g, "")
    .replace(/[*_~|]/g, "")
  return Array.from(withoutMarkdown).slice(0, maxLength).join("")
}
