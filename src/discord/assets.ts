import type { TranscriptEnv } from "../env.js"
import type { Logger } from "../logger.js"
import { isDiscordAssetUrl } from "./normalize.js"
import { setTimeout as sleep } from "node:timers/promises"

export class AssetFetcher {
  constructor(
    private readonly env: TranscriptEnv,
    private readonly log: Logger,
  ) {}

  async fetchAsDataUrl(url: string): Promise<string | null> {
    if (!this.env.inlineAssets) return null
    if (!isDiscordAssetUrl(url)) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new Error("timeout")), 10000)

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "ZenodeTranscript/0.1.2" },
        redirect: "error",
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) return null
      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? ""
      if (!/^(image|video|audio)\//.test(contentType) && contentType !== "application/pdf" && contentType !== "application/octet-stream") {
        return null
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > this.env.maxAssetBytes) return null

      const base64 = buffer.toString("base64")
      return `data:${contentType || "application/octet-stream"};base64,${base64}`
    } catch (error) {
      clearTimeout(timeout)
      return null
    }
  }
}
