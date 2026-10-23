import { loadEnv } from "./env.js"
import { Logger } from "./logger.js"
import { DiscordFetcher } from "./discord/fetcher.js"
import { normalizeTranscript } from "./discord/normalizer.js"
import { AssetFetcher } from "./discord/assets.js"
import { renderTranscript } from "./render/index.js"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

function parseArgs(args: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith("--")) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith("--")) {
        out[key] = next
        i++
      } else {
        out[key] = "true"
      }
    }
  }
  return out
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(`Usage:
  node dist/cli.js --channel <id> --out ticket.html [--title "..."]
  node dist/cli.js --payload ticket.json --out ticket.html`)
    return
  }

  const env = loadEnv({ requireSecrets: false })
  const log = new Logger("cli", env.logLevel)
  const fetcher = new DiscordFetcher(env, log)
  const assets = new AssetFetcher(env, log)
  const out = args.out ? resolve(args.out) : resolve("transcript.html")
  const maxMessages = Number(args["max-messages"]) || env.maxMessages
  const noInline = args["no-inline"] === "true"

  let fetched: any
  if (args.payload) {
    const raw = await readFile(resolve(args.payload), "utf8")
    const parsed = JSON.parse(raw)
    fetched = {
      channel: parsed.channel || { id: parsed.channelId },
      guild: parsed.guild || null,
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
      members: new Map(),
    }
  } else if (args.channel) {
    fetched = await fetcher.fetchChannel(args.channel, maxMessages)
  } else {
    console.error("Spécifier --channel ou --payload")
    process.exit(1)
  }

  if (!args["no-inline"] && env.inlineAssets && !noInline) {
    const inlineAssets = new Map<string, string>()
    let totalBytes = 0
    for (const msg of fetched.messages) {
      for (const att of Array.isArray(msg.attachments) ? msg.attachments : []) {
        if (!att?.url || !att?.id) continue
        if (totalBytes >= env.maxTotalAssetBytes) break
        const dataUrl = await assets.fetchAsDataUrl(att.url)
        if (!dataUrl) continue
        const size = Math.floor((dataUrl.length * 3) / 4)
        if (totalBytes + size > env.maxTotalAssetBytes) break
        totalBytes += size
        inlineAssets.set(att.id, dataUrl)
      }
    }
    fetched._inlineAssets = inlineAssets
  }

  const payload = normalizeTranscript({
    channel: fetched.channel,
    guild: fetched.guild,
    roles: fetched.roles,
    members: fetched.members,
    bot: null,
    messages: fetched.messages,
    inlineAssets: fetched._inlineAssets,
  })

  const html = renderTranscript(payload, {
    id: "cli",
    title: args.title || `Transcript - #${payload.channel.name}`,
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000,
    messageCount: payload.messages.length,
    publicUrl: env.publicUrl,
  })

  await writeFile(out, html, "utf8")
  console.log(`Transcript écrit : ${out} (${payload.messages.length} messages)`)
}

main().catch((error) => {
  console.error(`Erreur: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
