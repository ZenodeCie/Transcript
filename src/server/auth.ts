import { createHash, timingSafeEqual } from "node:crypto"
import type { IncomingMessage } from "node:http"
import type { TranscriptEnv } from "../env.js"

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest()
}

export function timingEqual(a: string, b: string): boolean {
  if (!a || !b) return false
  const da = digest(a)
  const db = digest(b)
  if (da.length !== db.length) return false
  try {
    return timingSafeEqual(da, db)
  } catch {
    return false
  }
}

export function extractApiKey(req: IncomingMessage): string | null {
  const header = req.headers["x-api-key"]
  if (typeof header === "string" && header.trim()) return header.trim()
  if (Array.isArray(header) && header[0]?.trim()) return header[0].trim()

  const auth = req.headers.authorization
  if (typeof auth === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim())
    if (match?.[1]) return match[1].trim()
  }
  if (Array.isArray(auth) && auth[0]) {
    const match = /^Bearer\s+(.+)$/i.exec(auth[0].trim())
    if (match?.[1]) return match[1].trim()
  }
  return null
}

export function isAuthorized(req: IncomingMessage, env: TranscriptEnv): boolean {
  const key = extractApiKey(req)
  return key !== null && timingEqual(key, env.apiKey)
}

export function clientKey(req: IncomingMessage, env: TranscriptEnv): string {
  if (env.trustProxy) {
    const forwarded = req.headers["x-forwarded-for"]
    if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim()
  }
  return req.socket.remoteAddress ?? "unknown"
}
