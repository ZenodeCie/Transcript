import { loadEnv } from "./env.js"
import { Logger } from "./logger.js"
import { TranscriptStore } from "./storage/store.js"
import { TranscriptServer } from "./server/server.js"
import { errorMessage } from "./logger.js"

async function main(): Promise<void> {
  const env = loadEnv({ requireSecrets: true })
  const log = new Logger("main", env.logLevel)

  const store = new TranscriptStore(env, log)
  await store.init()

  const server = new TranscriptServer(env, log, store)
  server.listen()

  const shutdown = (signal: string): void => {
    log.info("Arrêt en cours", { signal })
    server.close().then(() => {
      log.info("Service arrêté")
      process.exit(0)
    }).catch((error) => {
      log.error("Erreur lors de l'arrêt", { error: errorMessage(error) })
      process.exit(1)
    })
    setTimeout(() => process.exit(1), 10000)
  }

  process.on("SIGINT", () => shutdown("SIGINT"))
  process.on("SIGTERM", () => shutdown("SIGTERM"))
}

main().catch((error) => {
  console.error(`[Transcript][main] Erreur au démarrage: ${errorMessage(error)}`)
  process.exit(1)
})
