import { createReadStream } from "node:fs"
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { randomUUID } from "node:crypto"
import type { TranscriptEnv } from "../env.js"
import type { Logger } from "../logger.js"
import { isTranscriptId } from "../shared/ids.js"
import { isTranscriptRecord } from "../shared/guards.js"
import type { TranscriptMeta, TranscriptRecord } from "../shared/types.js"

export interface StoreStats {
  count: number
  bytes: number
}

export class TranscriptStore {
  private readonly dir: string
  private readonly transcriptsDir: string
  private readonly index = new Map<string, TranscriptMeta>()
  private readonly logger: Logger

  constructor(
    private readonly env: TranscriptEnv,
    parentLogger: Logger,
  ) {
    this.dir = resolve(env.dataDir)
    this.transcriptsDir = join(this.dir, "transcripts")
    this.logger = parentLogger.child("store")
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 }).catch(() => undefined)
    await mkdir(this.transcriptsDir, { recursive: true, mode: 0o700 }).catch(() => undefined)
    try { await chmod(this.dir, 0o700) } catch {}
    try { await chmod(this.transcriptsDir, 0o700) } catch {}

    await this.rebuildIndex()
    await this.purgeExpired()
  }

  private pathFor(id: string): string {
    return join(this.transcriptsDir, `${id}.json`)
  }

  private async rebuildIndex(): Promise<void> {
    this.index.clear()
    let entries: string[]
    try {
      entries = await readdir(this.transcriptsDir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      const id = entry.replace(/\.json$/, "")
      if (!isTranscriptId(id)) continue
      try {
        const raw = await readFile(this.pathFor(id), "utf8")
        const parsed: unknown = JSON.parse(raw)
        if (!isTranscriptRecord(parsed)) {
          await rm(this.pathFor(id), { force: true }).catch(() => undefined)
          continue
        }
        if (parsed.meta.expiresAt <= Date.now()) {
          await rm(this.pathFor(id), { force: true }).catch(() => undefined)
          continue
        }
        this.index.set(id, parsed.meta)
      } catch {
        // skip corrupt
      }
    }
    this.logger.info("Index reconstruit", { count: this.index.size })
  }

  async purgeExpired(now = Date.now()): Promise<number> {
    let removed = 0
    const expired: string[] = []
    for (const [id, meta] of this.index) {
      if (meta.expiresAt <= now) expired.push(id)
    }
    for (const id of expired) {
      if (await this.remove(id)) removed++
    }
    if (removed > 0) this.logger.info("Purge des transcripts expirés", { removed })
    return removed
  }

  async save(record: TranscriptRecord): Promise<void> {
    const path = this.pathFor(record.meta.id)
    const tmp = join(this.transcriptsDir, `.${randomUUID()}.tmp`)
    const content = `${JSON.stringify(record)}\n`

    try {
      await writeFile(tmp, content, { encoding: "utf8", mode: 0o600 })
      await chmod(tmp, 0o600).catch(() => undefined)
      await rename(tmp, path)
      try { await chmod(path, 0o600) } catch {}
      this.index.set(record.meta.id, record.meta)
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => undefined)
      throw error
    }
  }

  async get(id: string): Promise<TranscriptRecord | null> {
    if (!isTranscriptId(id)) return null
    const path = this.pathFor(id)
    let raw: string
    try {
      raw = await readFile(path, "utf8")
    } catch {
      return null
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null
    }

    if (!isTranscriptRecord(parsed)) {
      await rm(path, { force: true }).catch(() => undefined)
      this.index.delete(id)
      return null
    }

    if (parsed.meta.expiresAt <= Date.now()) {
      await rm(path, { force: true }).catch(() => undefined)
      this.index.delete(id)
      return null
    }

    return parsed
  }

  async getMeta(id: string): Promise<TranscriptMeta | null> {
    if (!isTranscriptId(id)) return null
    const cached = this.index.get(id)
    if (cached) {
      if (cached.expiresAt <= Date.now()) {
        await this.remove(id)
        return null
      }
      return cached
    }
    const record = await this.get(id)
    return record?.meta ?? null
  }

  async remove(id: string): Promise<boolean> {
    if (!isTranscriptId(id)) return false
    try {
      await rm(this.pathFor(id), { force: true })
      this.index.delete(id)
      return true
    } catch {
      return false
    }
  }

  findByChannelId(channelId: string): TranscriptMeta | null {
    const now = Date.now()
    let best: TranscriptMeta | null = null
    for (const meta of this.index.values()) {
      if (meta.channelId !== channelId) continue
      if (meta.expiresAt <= now) continue
      if (!best || meta.createdAt > best.createdAt) {
        best = meta
      }
    }
    return best
  }

  findLatestByGuildAndChannel(guildId: string, channelId: string): TranscriptMeta | null {
    const now = Date.now()
    let best: TranscriptMeta | null = null
    for (const meta of this.index.values()) {
      if (meta.guildId !== guildId) continue
      if (meta.channelId !== channelId) continue
      if (meta.expiresAt <= now) continue
      if (!best || meta.createdAt > best.createdAt) {
        best = meta
      }
    }
    return best
  }

  list(limit = 20, offset = 0): { items: TranscriptMeta[]; total: number } {
    const now = Date.now()
    const items = Array.from(this.index.values())
      .filter((meta) => meta.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(offset, offset + limit)
    return { items, total: this.index.size }
  }

  stats(): StoreStats {
    let bytes = 0
    const now = Date.now()
    for (const meta of this.index.values()) {
      if (meta.expiresAt > now) bytes += meta.sizeBytes
    }
    return { count: this.index.size, bytes }
  }

  fileStream(id: string): ReturnType<typeof createReadStream> | null {
    if (!isTranscriptId(id)) return null
    const meta = this.index.get(id)
    if (!meta || meta.expiresAt <= Date.now()) return null
    return createReadStream(this.pathFor(id))
  }
}
