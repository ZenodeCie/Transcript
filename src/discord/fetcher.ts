import type { TranscriptEnv } from "../env.js"
import type { Logger } from "../logger.js"
import { DiscordRest } from "./rest.js"
import { isSnowflake } from "../shared/ids.js"

export interface FetchedChannelData {
  channel: any
  guild: any | null
  messages: any[]
  roles: any[]
  members: Map<string, any>
}

export class DiscordFetcher {
  private readonly rest: DiscordRest

  constructor(
    env: TranscriptEnv,
    log: Logger,
  ) {
    this.rest = new DiscordRest(
      {
        token: env.discordToken,
        baseUrl: env.discordApiBase,
        userAgent: "ZenodeTranscript/0.1.2 (+https://github.com/ZenodeCie/Transcript)",
        maxRetries: 3,
      },
      log.child("discord"),
    )
  }

  async fetchChannel(channelId: string, maxMessages: number): Promise<FetchedChannelData> {
    if (!isSnowflake(channelId)) throw new Error("channelId invalide")
    const channel = await this.rest.get<any>(`/channels/${channelId}`)
    let guild: any | null = null
    let roles: any[] = []
    if (channel.guild_id && isSnowflake(channel.guild_id)) {
      try {
        const guildData = await this.rest.get<any>(`/guilds/${channel.guild_id}?with_counts=false`)
        guild = guildData
      } catch {}
      try {
        roles = await this.rest.get<any[]>(`/guilds/${channel.guild_id}/roles`)
      } catch {}
    }

    const messages = await this.fetchAllMessages(channelId, maxMessages)
    return { channel, guild, messages, roles, members: new Map() }
  }

  private async fetchAllMessages(channelId: string, maxMessages: number): Promise<any[]> {
    const collected: any[] = []
    let before: string | undefined
    const limit = Math.min(maxMessages, 10000)

    while (collected.length < limit) {
      const batchSize = Math.min(100, limit - collected.length)
      const query = new URLSearchParams({ limit: String(batchSize) })
      if (before) query.set("before", before)
      const batch = await this.rest.get<any[]>(`/channels/${channelId}/messages?${query.toString()}`)
      if (batch.length === 0) break
      collected.push(...batch)
      before = batch[batch.length - 1]?.id
      if (batch.length < batchSize) break
    }

    return collected.reverse()
  }
}
