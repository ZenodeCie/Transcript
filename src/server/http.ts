import type { IncomingMessage, ServerResponse } from "node:http"
import { URL } from "node:url"
import { errorMessage } from "../logger.js"

export interface ParsedRequest {
  method: string
  path: string
  pathname: string
  searchParams: URLSearchParams
}

/**
 * Base URL used to build absolute links: PUBLIC_URL when configured, otherwise
 * derived from the incoming request (Host + X-Forwarded-Proto when trusted).
 */
export function resolvePublicBase(
  req: IncomingMessage,
  config: { publicUrl: string | null; trustProxy: boolean },
): string | null {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, "")
  const host = req.headers.host
  if (!host) return null
  let proto = "http"
  if (config.trustProxy) {
    const forwarded = req.headers["x-forwarded-proto"]
    if (typeof forwarded === "string" && forwarded.trim()) {
      proto = forwarded.split(",")[0]!.trim()
    }
  } else if ((req.socket as { encrypted?: boolean }).encrypted) {
    proto = "https"
  }
  return `${proto}://${host}`
}

export function parseRequest(req: IncomingMessage): ParsedRequest {
  const host = req.headers.host ?? "localhost"
  const url = new URL(req.url ?? "/", `http://${host}`)
  return {
    method: req.method ?? "GET",
    path: url.pathname + url.search,
    pathname: url.pathname,
    searchParams: url.searchParams,
  }
}

export async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let aborted = false

    req.on("data", (chunk: Buffer) => {
      if (aborted) return
      size += chunk.length
      if (size > maxBytes) {
        aborted = true
        reject(new Error("body_too_large"))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on("end", () => {
      if (aborted) return
      if (chunks.length === 0) return resolve(null)
      try {
        const body = Buffer.concat(chunks).toString("utf8")
        resolve(JSON.parse(body))
      } catch {
        reject(new Error("invalid_json"))
      }
    })

    req.on("error", () => {
      if (aborted) return
      reject(new Error("request_error"))
    })
  })
}

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  })
  res.end(payload)
}

export function sendText(res: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8", headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    ...headers,
  })
  res.end(body)
}

export function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { error: { code, message } })
}

export function jsonErrorToStatus(error: string): number {
  if (error === "body_too_large") return 413
  if (error === "invalid_json") return 400
  if (error === "request_error") return 400
  return 400
}

export function getParam(pathname: string, pattern: RegExp): string | null {
  const match = pattern.exec(pathname)
  return match?.[1] ?? null
}

export function errorMessageSafe(error: unknown): string {
  return errorMessage(error)
}
