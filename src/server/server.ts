import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { URL } from "node:url"
import type { TranscriptEnv } from "../env.js"
import type { Logger } from "../logger.js"
import { TranscriptStore } from "../storage/store.js"
import { isAuthorized, clientKey } from "./auth.js"
import { TokenBucket } from "./rateLimit.js"
import { parseRequest, readJson, sendJson, sendText, sendError, jsonErrorToStatus, getParam } from "./http.js"
import { verifyLink } from "../storage/signedLink.js"
import { renderTranscript } from "../render/index.js"
import { DiscordFetcher } from "../discord/fetcher.js"
import { normalizeTranscript } from "../discord/normalizer.js"
import { AssetFetcher } from "../discord/assets.js"
import { isSnowflake, newTranscriptId } from "../shared/ids.js"
import { cleanText } from "../shared/guards.js"
import { parseDuration, clampDuration } from "../shared/time.js"
import { TRANSCRIPT_VERSION } from "../shared/types.js"
import type { TranscriptRecord } from "../shared/types.js"
import { errorMessage } from "../logger.js"

export class TranscriptServer {
  private server = createServer((req, res) => this.handle(req, res))
  private readonly rateLimit: TokenBucket
  private readonly fetcher: DiscordFetcher
  private readonly assets: AssetFetcher
  private purgeTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly env: TranscriptEnv,
    private readonly log: Logger,
    private readonly store: TranscriptStore,
  ) {
    this.rateLimit = new TokenBucket(env.rateLimitPerMinute)
    this.fetcher = new DiscordFetcher(env, log)
    this.assets = new AssetFetcher(env, log)
  }

  listen(): void {
    this.server.listen(this.env.port, this.env.host, () => {
      this.log.info("Serveur HTTP démarré", { host: this.env.host, port: this.env.port })
    })
    this.purgeTimer = setInterval(() => {
      this.store.purgeExpired().catch(() => undefined)
      this.rateLimit.cleanup()
    }, this.env.purgeIntervalMs)
  }

  async close(): Promise<void> {
    if (this.purgeTimer) clearInterval(this.purgeTimer)
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const parsed = parseRequest(req)
      const { method, pathname } = parsed

      res.setHeader("X-Content-Type-Options", "nosniff")
      res.setHeader("Referrer-Policy", "no-referrer")
      res.setHeader("X-Frame-Options", "DENY")

      if (this.env.corsOrigin && method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Origin", this.env.corsOrigin)
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-API-Key,Authorization")
        res.writeHead(204)
        res.end()
        return
      }
      if (this.env.corsOrigin) {
        res.setHeader("Access-Control-Allow-Origin", this.env.corsOrigin)
      }

      if (method === "GET" && pathname === "/health") {
        const stats = this.store.stats()
        sendJson(res, 200, { status: "ok", version: "0.1.5", transcripts: stats.count, bytes: stats.bytes })
        return
      }
      if (method === "GET" && pathname === "/") {
        sendJson(res, 200, { name: "zenode-transcript", version: "0.1.5" })
        return
      }

      const botRoute = pathname.match(/^\/bot0000\/(\d{17,20})\/(\d{17,20})\.html$/)
      if (method === "GET" && botRoute) {
        const guildId = botRoute[1]
        const channelId = botRoute[2]
        const meta = this.store.findLatestByGuildAndChannel(guildId, channelId)
        if (!meta) {
          sendError(res, 404, "not_found", "Transcript introuvable pour ce salon")
          return
        }
        const exp = Math.floor(meta.expiresAt / 1000)
        const { signLink, buildSignedUrl } = await import("../storage/signedLink.js")
        const sig = signLink(this.env.signingSecret, meta.id, exp)
        const url = buildSignedUrl(this.env.publicUrl, meta.id, exp, sig)
        res.writeHead(302, { Location: url, "Cache-Control": "no-store" })
        res.end()
        return
      }

      if (method === "GET" && pathname.startsWith("/t/")) {
        const id = pathname.split("/")[2]
        const exp = Number(parsed.searchParams.get("exp"))
        const sig = parsed.searchParams.get("sig") ?? ""
        if (!verifyLink(this.env.signingSecret, id, exp, sig)) {
          sendError(res, 403, "invalid_signature", "Lien signé invalide ou manquant")
          return
        }
        const record = await this.store.get(id)
        if (!record) {
          sendError(res, 404, "not_found", "Transcript introuvable ou expiré")
          return
        }
        const html = renderTranscript(record.payload, {
          id: record.meta.id,
          title: record.meta.title,
          createdAt: record.meta.createdAt,
          expiresAt: record.meta.expiresAt,
          messageCount: record.meta.messageCount,
          publicUrl: this.env.publicUrl,
        })
        sendText(res, 200, html, "text/html; charset=utf-8", { "Cache-Control": "no-store" })
        return
      }

      // API routes require authentication
      if (!isAuthorized(req, this.env)) {
        sendError(res, 401, "unauthorized", "Clé API manquante ou invalide")
        return
      }

      if (method === "POST" && pathname === "/v1/transcripts") {
        const bucket = this.rateLimit.take(`create:${clientKey(req, this.env)}`)
        if (!bucket.ok) {
          res.setHeader("Retry-After", String(bucket.retryAfter))
          sendError(res, 429, "rate_limited", "Trop de requêtes")
          return
        }

        let body: unknown
        try {
          body = await readJson(req, this.env.maxBodyBytes)
        } catch (error) {
          sendError(res, jsonErrorToStatus(errorMessage(error)), errorMessage(error), "Corps de requête invalide")
          return
        }

        if (!body || typeof body !== "object") {
          sendError(res, 400, "invalid_payload", "Corps JSON attendu")
          return
        }
        const input = body as Record<string, unknown>
        if (!isSnowflake(input.channelId)) {
          sendError(res, 400, "invalid_channel_id", "channelId Discord snowflake requis")
          return
        }

        let fetched: any = null
        if (Array.isArray(input.messages)) {
          fetched = {
            channel: input.channel && typeof input.channel === "object" ? input.channel : { id: input.channelId },
            guild: input.guild && typeof input.guild === "object" ? input.guild : null,
            messages: input.messages,
            roles: Array.isArray(input.roles) ? input.roles : [],
            members: new Map(),
          }
        } else {
          if (!this.env.discordToken) {
            sendError(res, 400, "discord_not_configured", "DISCORD_BOT_TOKEN requis pour fetcher le salon")
            return
          }
          try {
            fetched = await this.fetcher.fetchChannel(input.channelId as string, this.env.maxMessages)
          } catch (error) {
            const msg = errorMessage(error)
            if (msg.includes("401") || msg.includes("403")) {
              sendError(res, 502, "discord_error", "Accès au salon refusé")
              return
            }
            if (msg.includes("404")) {
              sendError(res, 404, "not_found", "Salon introuvable")
              return
            }
            sendError(res, 502, "discord_error", "Erreur lors de la récupération depuis Discord")
            return
          }
        }

        if (fetched.messages.length > this.env.maxMessages) {
          sendError(res, 400, "invalid_payload", `Trop de messages (${fetched.messages.length} > ${this.env.maxMessages})`)
          return
        }

        // Inline assets
        const inlineAssets = new Map<string, string>()
        if (this.env.inlineAssets) {
          const tasks: Promise<void>[] = []
          let totalBytes = 0
          for (const msg of fetched.messages) {
            for (const att of Array.isArray(msg.attachments) ? msg.attachments : []) {
              if (!att?.url || !att?.id) continue
              if (totalBytes >= this.env.maxTotalAssetBytes) break
              tasks.push(
                this.assets
                  .fetchAsDataUrl(att.url)
                  .then((dataUrl) => {
                    if (!dataUrl) return
                    const size = Math.floor((dataUrl.length * 3) / 4)
                    if (totalBytes + size > this.env.maxTotalAssetBytes) return
                    totalBytes += size
                    inlineAssets.set(att.id, dataUrl)
                    inlineAssets.set(att.url, dataUrl)
                  })
                  .catch(() => undefined),
              )
            }
          }
          await Promise.allSettled(tasks.slice(0, 200))
        }

        const payload = normalizeTranscript({
          channel: fetched.channel,
          guild: fetched.guild ?? (input.guild && typeof input.guild === "object" ? (input.guild as any) : null),
          roles: fetched.roles ?? (Array.isArray(input.roles) ? input.roles : []),
          members: fetched.members,
          bot: input.bot && typeof input.bot === "object" ? (input.bot as any) : null,
          messages: fetched.messages,
          inlineAssets,
        })

        const ttlMs = clampDuration(parseDuration(input.expiresIn), this.env.defaultTtlMs, this.env.maxTtlMs)
        const now = Date.now()
        const id = newTranscriptId()
        const exp = Math.floor((now + ttlMs) / 1000)
        const sig = (await import("../storage/signedLink.js")).signLink(this.env.signingSecret, id, exp)
        const url = (await import("../storage/signedLink.js")).buildSignedUrl(this.env.publicUrl, id, exp, sig)
        const title = cleanText(input.title, 200) || `Ticket #${payload.channel.name}`

        const record: TranscriptRecord = {
          version: TRANSCRIPT_VERSION,
          meta: {
            id,
            channelId: payload.channel.id,
            guildId: payload.guild?.id ?? null,
            title,
            source: Array.isArray(input.messages) ? "json" : "discord",
            createdAt: now,
            expiresAt: now + ttlMs,
            messageCount: payload.messages.length,
            sizeBytes: Buffer.byteLength(JSON.stringify(payload)),
          },
          payload,
        }

        await this.store.save(record)
        sendJson(res, 201, { id, url, createdAt: new Date(now).toISOString(), expiresAt: new Date(record.meta.expiresAt).toISOString(), messageCount: record.meta.messageCount, sizeBytes: record.meta.sizeBytes })
        return
      }

      if (method === "GET" && pathname === "/v1/transcripts") {
        const limit = Math.min(Math.max(Number(parsed.searchParams.get("limit")) || 20, 1), 100)
        const offset = Math.max(Number(parsed.searchParams.get("offset")) || 0, 0)
        const result = this.store.list(limit, offset)
        sendJson(res, 200, { items: result.items, total: result.total, limit, offset })
        return
      }

      const getId = getParam(pathname, /^\/v1\/transcripts\/([A-Za-z0-9_-]+)$/)
      if (getId && method === "GET") {
        const record = await this.store.get(getId)
        if (!record) {
          sendError(res, 404, "not_found", "Transcript introuvable")
          return
        }
        sendJson(res, 200, { meta: record.meta, payload: record.payload })
        return
      }

      if (getId && method === "DELETE") {
        const removed = await this.store.remove(getId)
        if (!removed) {
          sendError(res, 404, "not_found", "Transcript introuvable")
          return
        }
        res.writeHead(204)
        res.end()
        return
      }

      sendError(res, 405, "method_not_allowed", "Méthode ou route non supportée")
    } catch (error) {
      this.log.error("Erreur serveur non gérée", { error: errorMessage(error) })
      sendError(res, 500, "internal_error", "Erreur interne")
    }
  }
}
