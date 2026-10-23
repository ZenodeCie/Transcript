import { createHmac, timingSafeEqual } from "node:crypto"

function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function signLink(secret: string, id: string, exp: number): string {
  const data = `${id}.${exp}`
  const mac = createHmac("sha256", secret).update(data).digest()
  return base64url(mac)
}

export function verifyLink(secret: string, id: string, exp: number, sig: string): boolean {
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(exp) || exp <= 0 || exp < now - 60) return false

  const expected = signLink(secret, id, exp)
  if (expected.length !== sig.length) return false

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

export function buildSignedUrl(baseUrl: string | null, id: string, exp: number, sig: string): string {
  const path = `/t/${encodeURIComponent(id)}?exp=${exp}&sig=${encodeURIComponent(sig)}`
  if (!baseUrl) return path
  return `${baseUrl.replace(/\/$/, "")}${path}`
}
