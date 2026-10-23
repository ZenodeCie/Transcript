import type { TranscriptProfile, TranscriptRole } from "../shared/types.js"

export interface RenderContext {
  profiles: Record<string, TranscriptProfile>
  roles: Record<string, TranscriptRole>
  channels: Record<string, { id: string; name: string }>
}

export function profileOf(ctx: RenderContext, id: string): TranscriptProfile {
  return (
    ctx.profiles[id] ?? {
      id,
      username: "Utilisateur inconnu",
      displayName: "Utilisateur inconnu",
      avatarUrl: null,
      bot: false,
      verified: false,
      color: null,
      roles: [],
    }
  )
}

export function displayNameOf(ctx: RenderContext, id: string | null): string {
  if (!id) return "Utilisateur inconnu"
  return profileOf(ctx, id).displayName
}
