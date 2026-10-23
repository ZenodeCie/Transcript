import { setTimeout as sleep } from "node:timers/promises"
import type { Logger } from "../logger.js"

export class DiscordRateLimitError extends Error {
  retryAfter: number
  constructor(message: string, retryAfter: number) {
    super(message)
    this.name = "DiscordRateLimitError"
    this.retryAfter = retryAfter
  }
}

export class DiscordHttpError extends Error {
  status: number
  body: string
  constructor(status: number, body: string) {
    super(`Discord API error ${status}`)
    this.name = "DiscordHttpError"
    this.status = status
    this.body = body
  }
}

export interface DiscordRestOptions {
  token: string | null
  baseUrl: string
  userAgent: string
  maxRetries: number
}

export class DiscordRest {
  constructor(
    private readonly options: DiscordRestOptions,
    private readonly log: Logger,
  ) {}

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      "User-Agent": this.options.userAgent,
      Accept: "application/json",
    }
    if (this.options.token) {
      headers.Authorization = `Bot ${this.options.token}`
    }
    return headers
  }

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    if (!this.options.token) {
      throw new Error("DISCORD_BOT_TOKEN requis pour cette opération")
    }

    const url = `${this.options.baseUrl.replace(/\/$/, "")}${path}`
    let attempts = 0

    while (attempts <= this.options.maxRetries) {
      attempts++
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(new Error("timeout")), 15000)
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal

      try {
        const response = await fetch(url, { method: "GET", headers: this.headers(), signal: combined })
        clearTimeout(timeout)

        if (response.status === 429) {
          const data = (await response.json().catch(() => ({}))) as { retry_after?: number; global?: boolean }
          const retryAfter = Math.max(1, Math.ceil(data.retry_after ?? 1))
          if (attempts > this.options.maxRetries) throw new DiscordRateLimitError("Rate limité par Discord", retryAfter)
          await sleep(retryAfter * 1000)
          continue
        }

        if (response.status >= 500 && attempts <= this.options.maxRetries) {
          await sleep(500 * attempts)
          continue
        }

        if (!response.ok) {
          const body = await response.text().catch(() => "")
          throw new DiscordHttpError(response.status, body.slice(0, 500))
        }

        return (await response.json()) as T
      } catch (error) {
        clearTimeout(timeout)
        if (error instanceof DiscordRateLimitError) throw error
        if (error instanceof DiscordHttpError) throw error
        if (attempts > this.options.maxRetries) throw error
        await sleep(250 * attempts)
      }
    }

    throw new Error("Échec de la requête Discord")
  }
}
