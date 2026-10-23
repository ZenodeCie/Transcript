const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char)
}

const DATA_URL_PATTERN =
  /^data:(?:image\/(?:png|jpe?g|gif|webp|avif)|video\/(?:mp4|webm)|audio\/(?:mpeg|ogg|wav|webm)|application\/(?:pdf|zip|octet-stream));base64,[a-z0-9+/=]+$/i

/** External URLs only: http/https, no credentials. Returns the normalized URL or null. */
export function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.username || url.password) return null
  return url.toString()
}

/** Accepts server-inlined data URLs (safe MIME types only) or external http(s) URLs. */
export function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (trimmed.startsWith("data:")) {
    return DATA_URL_PATTERN.test(trimmed) ? trimmed : null
  }
  return safeExternalUrl(trimmed)
}

export function humanFileSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return ""
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${Array.from(value).slice(0, maxLength).join("")}…`
}

export function formatFallbackDate(ms: number): string {
  if (!Number.isFinite(ms)) return ""
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`
}

/** Renders a <time> element that the client script localizes; the fallback stays readable without JS. */
export function renderTime(ms: number, className?: string): string {
  const iso = new Date(ms).toISOString()
  const classAttribute = className ? ` class="${escapeHtml(className)}"` : ""
  return `<time${classAttribute} datetime="${iso}" data-ts="${ms}">${escapeHtml(formatFallbackDate(ms))}</time>`
}

export function renderDiscordTimestamp(unixSeconds: number, style: string | null): string {
  const ms = unixSeconds * 1000
  const iso = new Date(ms).toISOString()
  const format = style && /^[tTdDfFR]$/.test(style) ? ` data-format="${style}"` : ""
  return `<time datetime="${iso}" data-ts="${ms}"${format}>${escapeHtml(formatFallbackDate(ms))}</time>`
}
