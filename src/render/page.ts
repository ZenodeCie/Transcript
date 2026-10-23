import type { TranscriptPayload } from "../shared/types.js"
import { escapeHtml } from "./html.js"
import { renderMessages } from "./messages.js"
import { profileOf } from "./context.js"
import type { RenderContext } from "./context.js"

export interface PageOptions {
  id: string
  title: string
  createdAt: number
  expiresAt: number
  messageCount: number
  publicUrl: string | null
}

const CSS = `:root{--bg:#313338;--bg-2:#2b2d31;--bg-3:#1e1f22;--panel:#383a40;--text:#dbdee1;--text-muted:#b5bac1;--text-dim:#949ba4;--accent:#5865f2;--accent-2:#4752c4;--green:#23a55a;--red:#da373c;--yellow:#f0b232;--border:#3f4147;--link:#00a8fc;--mention-bg:rgba(88,101,242,.3);--mention-text:#dee0fc;--spoiler:#202225;--spoiler-revealed:rgba(78,80,88,.48)}
[data-theme="light"]{--bg:#f2f3f5;--bg-2:#e3e5e8;--bg-3:#ffffff;--panel:#ffffff;--text:#2e3338;--text-muted:#4e5058;--text-dim:#6d6f78;--border:#d4d7dc;--link:#006ce7;--mention-bg:rgba(88,101,242,.18);--mention-text:#3c45c5;--spoiler:#d7d9dc;--spoiler-revealed:rgba(180,185,190,.5)}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:16px;line-height:1.375; -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--link);text-decoration:none}
a:hover{text-decoration:underline}
header{position:sticky;top:0;z-index:10;background:linear-gradient(180deg,var(--bg-3) 0%,rgba(30,31,34,.96) 100%);backdrop-filter:blur(8px);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;padding:12px 20px;flex-wrap:wrap}
[data-theme="light"] header{background:linear-gradient(180deg,rgba(255,255,255,.98) 0%,rgba(242,243,245,.98) 100%)}
.header-icon{width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff}
.header-icon img{width:100%;height:100%;border-radius:50%}
.header-info{flex:1;min-width:220px}
.header-title{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.header-title h1{margin:0;font-size:18px;font-weight:700;color:#fff}
[data-theme="light"] .header-title h1{color:var(--text)}
.header-channel{color:var(--text-dim)}
.header-meta{margin-top:2px;font-size:13px;color:var(--text-dim);display:flex;gap:12px;flex-wrap:wrap}
.header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.search-wrap{position:relative}
.search-input{background:var(--bg-2);border:1px solid transparent;border-radius:4px;color:var(--text);padding:6px 10px 6px 28px;font-size:14px;width:220px}
.search-wrap::before{content:"🔍";position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:12px}
.action-btn{background:transparent;border:1px solid transparent;color:var(--text-muted);border-radius:4px;padding:6px 10px;font-size:14px;cursor:pointer}
.action-btn:hover{background:var(--panel);color:var(--text)}
main{max-width:980px;margin:0 auto;padding:16px 20px 80px}
.messages{display:flex;flex-direction:column;gap:0}
.message{position:relative;display:flex;gap:16px;padding:2px 16px 2px 16px;margin:0 -16px;transition:background .15s ease}
.message:hover{background:rgba(2,2,5,.02)}
.message.is-pinned{background:rgba(240,178,50,.08)}
.avatar{width:40px;height:40px;border-radius:50%;margin-top:4px;flex-shrink:0;object-fit:cover}
.avatar-fallback{display:flex;align-items:center;justify-content:center;font-weight:700;text-transform:uppercase}
.message-body{flex:1;min-width:0;padding:2px 0}
.message-header{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.author{font-weight:500;font-size:16px}
.author:hover{text-decoration:underline;cursor:default}
.badge{display:inline-flex;align-items:center;justify-content:center;border-radius:3px;font-size:10px;font-weight:600;text-transform:uppercase;padding:0 4px;height:15px}
.badge-bot{background:var(--accent);color:#fff}
.badge-verified{background:var(--green);color:#fff}
.timestamp{color:var(--text-dim);font-size:12px}
.edited{color:var(--text-dim);font-size:12px}
.pinned{color:var(--yellow);font-size:12px}
.message-link{opacity:0;color:var(--text-dim);font-size:14px;margin-left:auto}
.message:hover .message-link{opacity:1}
.reply{display:flex;align-items:center;gap:6px;margin:4px 0 0 0;padding:2px 0 2px 10px;border-left:2px solid var(--border);color:var(--text-dim);font-size:14px;max-width:100%;overflow:hidden}
.reply-content{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reply-deleted{color:var(--text-dim)}
.interaction{color:var(--text-dim);font-size:14px;margin-top:4px}
.message-content{white-space:pre-wrap;word-break:break-word;color:var(--text)}
.system{justify-content:center;text-align:center;padding:8px 16px}
.system .avatar{display:none}
.system .message-body{display:flex;justify-content:center}
.system-content{color:var(--text-dim);font-size:14px}
.md-code{background:var(--bg-3);border:1px solid var(--border);border-radius:4px;padding:1px 4px;font-family:Consolas,"Liberation Mono",Menlo,monospace;font-size:85%}
.md-codeblock{background:var(--bg-3);border:1px solid var(--border);border-radius:4px;padding:12px;margin:8px 0;overflow-x:auto;font-family:Consolas,"Liberation Mono",Menlo,monospace;font-size:85%}
.md-codeblock code{white-space:pre}
.md-quote{border-left:4px solid var(--border);padding:4px 12px;margin:4px 0;color:var(--text-muted)}
.md-heading{font-weight:700;margin:16px 0 8px}
.md-h1{font-size:24px}.md-h2{font-size:20px}.md-h3{font-size:16px}
.md-subtext{font-size:12px;color:var(--text-dim)}
.mention{border-radius:3px;padding:0 2px;background:var(--mention-bg);color:var(--mention-text)}
.mention:hover{text-decoration:underline}
.spoiler{background:var(--spoiler);color:transparent;border-radius:3px;padding:0 2px;cursor:pointer;user-select:none}
.spoiler.revealed{background:var(--spoiler-revealed);color:var(--text);user-select:text}
.embeds{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.embed{display:flex;gap:16px;background:var(--panel);border-radius:4px;border-left:4px solid var(--border);max-width:520px;padding:12px}
.embed-main{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
.embed-author{display:flex;align-items:center;gap:8px}
.embed-author-icon{width:24px;height:24px;border-radius:50%}
.embed-author-name{font-weight:600;font-size:14px}
.embed-title{font-weight:600;font-size:16px}
.embed-description{font-size:14px;white-space:pre-wrap;word-break:break-word}
.embed-fields{display:flex;flex-wrap:wrap;gap:8px}
.embed-field{flex:1 1 100%;display:flex;flex-direction:column;gap:2px}
.embed-field.inline{flex:1 1 45%}
.embed-field-name{font-weight:600;font-size:14px}
.embed-field-value{font-size:14px;white-space:pre-wrap;word-break:break-word}
.embed-thumbnail{width:80px;height:80px;border-radius:4px;object-fit:cover;align-self:flex-start}
.embed-image{max-width:100%;border-radius:4px;margin-top:4px}
.embed-footer{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-dim);margin-top:4px}
.embed-footer-icon{width:20px;height:20px;border-radius:50%}
.attachment-grid{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.attachment-image-link{display:block;max-width:400px}
.attachment-image{max-width:400px;max-height:300px;border-radius:4px}
.attachment-video,.attachment-audio{max-width:400px;margin-top:8px}
.attachment-file{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--border);border-radius:4px;padding:10px 14px;margin-top:8px;max-width:420px}
.file-name{font-weight:500}
.file-size{color:var(--text-dim);font-size:12px;margin-left:auto}
.stickers{display:flex;gap:4px;margin-top:8px;flex-wrap:wrap}
.sticker{width:160px;height:160px;object-fit:contain}
.sticker-name{color:var(--text-dim)}
.poll{background:var(--panel);border-radius:4px;padding:12px;margin-top:8px;max-width:420px;display:flex;flex-direction:column;gap:6px}
.poll-question{font-weight:600}
.poll-answer{position:relative;overflow:hidden;border-radius:4px;background:var(--bg-2)}
.poll-bar{position:absolute;inset:0 auto 0 0;background:rgba(88,101,242,.4)}
.poll-answer.is-voted .poll-bar{background:rgba(88,101,242,.6)}
.poll-answer-content{position:relative;display:flex;align-items:center;gap:8px;padding:8px 12px}
.poll-count{margin-left:auto;color:var(--text-dim)}
.poll-meta{font-size:12px;color:var(--text-dim)}
.reactions{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px}
.reaction{display:flex;align-items:center;gap:6px;background:var(--panel);border:1px solid transparent;border-radius:8px;padding:4px 8px;font-size:14px}
.reaction.is-me{border-color:var(--accent);background:rgba(88,101,242,.2)}
.reaction-count{color:var(--text-muted)}
.forwarded{margin-top:8px;border-left:2px solid var(--border);padding-left:12px}
.forwarded-label{font-size:12px;color:var(--text-dim)}
.forwarded-author{font-size:14px;margin-top:4px}
.forwarded-content{font-size:14px;margin-top:4px}
.components{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.dc-action-row{display:flex;flex-wrap:wrap;gap:8px}
.dc-button{display:inline-flex;align-items:center;gap:6px;border-radius:3px;padding:7px 16px;font-size:14px;font-weight:500;line-height:1.2}
.dc-button-primary{background:var(--accent);color:#fff}
.dc-button-secondary{background:#4e5058;color:#fff}
.dc-button-success{background:var(--green);color:#fff}
.dc-button-danger{background:var(--red);color:#fff}
.dc-button-link{background:transparent;color:var(--link)}
.dc-button.disabled{opacity:.5;pointer-events:none}
.button-emoji{width:18px;height:18px}
.dc-select{background:var(--panel);border:1px solid var(--border);border-radius:4px;max-width:440px;overflow:hidden}
.select-placeholder{padding:10px 12px;color:var(--text-muted)}
.select-options{border-top:1px solid var(--border)}
.select-option{display:flex;flex-direction:column;padding:8px 12px}
.select-option.is-default{background:rgba(88,101,242,.2)}
.select-option-label{display:flex;align-items:center;gap:8px}
.select-option-description{color:var(--text-dim);font-size:12px;margin-left:26px}
.dc-text{max-width:520px}
.dc-thumbnail{width:96px;height:96px;border-radius:4px;object-fit:cover}
.dc-media-gallery{display:flex;flex-wrap:wrap;gap:4px}
.dc-media-item{max-width:200px;max-height:200px;border-radius:4px}
.dc-container{border-left:4px solid var(--border);background:var(--panel);border-radius:4px;padding:12px;display:flex;flex-direction:column;gap:8px;max-width:560px}
.dc-section{display:flex;gap:12px;align-items:flex-start}
.dc-section-content{flex:1;display:flex;flex-direction:column;gap:8px}
.dc-section-accessory{flex-shrink:0}
.dc-separator{border:none;border-top:1px solid var(--border);margin:8px 0}
.dc-separator-space{height:8px}
.spoiler-media{filter:blur(20px);transition:filter .2s ease}
.spoiler-media.revealed{filter:none}
.lightbox{position:fixed;inset:0;background:rgba(0,0,0,.8);display:none;align-items:center;justify-content:center;z-index:100}
.lightbox.active{display:flex}
.lightbox img{max-width:90vw;max-height:90vh;border-radius:4px}
.empty-state{text-align:center;color:var(--text-dim);padding:40px}
footer{text-align:center;color:var(--text-dim);padding:40px 20px;font-size:13px}
@media (max-width:720px){.message{gap:12px;padding:2px 12px;margin:0 -12px}.avatar{width:36px;height:36px}.header-icon{width:36px;height:36px}.search-input{width:160px}.embed{flex-direction:column}.embed-thumbnail{align-self:flex-start}}
@media (max-width:520px){main{padding:12px 12px 60px}header{padding:10px 12px}.search-input{width:120px}}
@media print{header,.header-actions,.message-link{display:none}body{background:#fff;color:#000}.message{break-inside:avoid}.spoiler{color:#000;background:#ddd}}`

const SCRIPT = `(() => {
  const themeKey = "zenode-transcript-theme"
  const themeBtn = document.getElementById("theme-toggle")
  const applyTheme = (t) => { document.documentElement.dataset.theme = t; localStorage.setItem(themeKey, t) }
  applyTheme(localStorage.getItem(themeKey) || "dark")
  themeBtn?.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"))

  document.querySelectorAll("time[data-ts]").forEach((el) => {
    const ms = Number(el.dataset.ts)
    if (!Number.isFinite(ms)) return
    const d = new Date(ms)
    const fmt = el.dataset.format
    let text
    if (fmt === "t") text = d.toLocaleTimeString()
    else if (fmt === "T") text = d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})
    else if (fmt === "d") text = d.toLocaleDateString()
    else if (fmt === "D") text = d.toLocaleDateString([], {day:"numeric",month:"long",year:"numeric"})
    else if (fmt === "f") text = d.toLocaleString([], {day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})
    else if (fmt === "F") text = d.toLocaleString([], {weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})
    else if (fmt === "R") { const diff = Math.floor((Date.now()-ms)/1000); text = diff>60 ? d.toLocaleString([], {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "il y a quelques secondes" }
    else text = d.toLocaleString()
    if (text) el.textContent = text
  })

  document.querySelectorAll(".spoiler").forEach((el) => { el.addEventListener("click", () => el.classList.toggle("revealed")); el.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); el.classList.toggle("revealed") }}) })
  document.querySelectorAll(".spoiler-media").forEach((el) => { el.addEventListener("click", () => el.classList.toggle("revealed")) })

  const search = document.getElementById("transcript-search")
  const count = document.getElementById("message-count")
  const messages = Array.from(document.querySelectorAll(".message"))
  search?.addEventListener("input", () => {
    const q = search.value.toLowerCase().trim()
    let visible = 0
    messages.forEach((m) => { const hit = !q || (m.dataset.search||"").includes(q); m.style.display = hit ? "" : "none"; if(hit) visible++ })
    if (count) count.textContent = q ? visible+" / "+messages.length+" messages" : messages.length+" messages"
  })

  document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { e.preventDefault(); search?.focus() } })

  const lightbox = document.getElementById("lightbox")
  const lightboxImg = document.getElementById("lightbox-img")
  document.querySelectorAll("[data-lightbox]").forEach((a) => { a.addEventListener("click", (e)=>{ e.preventDefault(); if(lightboxImg){ lightboxImg.src=a.dataset.lightbox; lightbox.classList.add("active") }}) })
  lightbox?.addEventListener("click", () => lightbox.classList.remove("active"))
  document.addEventListener("keydown", (e)=>{ if(e.key==="Escape") lightbox?.classList.remove("active") })
})()` 

function renderHeader(options: PageOptions, payload: TranscriptPayload): string {
  const guildName = payload.guild?.name ?? "Serveur inconnu"
  const channelName = payload.channel.name
  const title = options.title || `#${channelName}`
  const icon = payload.guild?.iconUrl ? `<img src="${escapeHtml(payload.guild.iconUrl)}" alt="" loading="lazy">` : `<span>${escapeHtml(guildName[0] ?? "?")}</span>`

  return `<header>
  <div class="header-icon">${icon}</div>
  <div class="header-info">
    <div class="header-title">
      <h1>${escapeHtml(title)}</h1>
      <span class="header-channel">• ${escapeHtml(guildName)} / #${escapeHtml(channelName)}</span>
    </div>
    <div class="header-meta">
      <span id="message-count">${options.messageCount} message${options.messageCount > 1 ? "s" : ""}</span>
      <span>Créé le ${escapeHtml(new Date(options.createdAt).toLocaleString())}</span>
      <span>Expire le ${escapeHtml(new Date(options.expiresAt).toLocaleString())}</span>
    </div>
  </div>
  <div class="header-actions">
    <div class="search-wrap">
      <input id="transcript-search" class="search-input" type="search" placeholder="Rechercher..." autocomplete="off" spellcheck="false">
    </div>
    <button class="action-btn" onclick="window.print()" title="Imprimer">🖨️</button>
    <button class="action-btn" id="theme-toggle" title="Basculer le thème">🌓</button>
  </div>
</header>`
}

export function renderPage(payload: TranscriptPayload, options: PageOptions): string {
  const ctx: RenderContext = {
    profiles: payload.profiles,
    roles: payload.roles,
    channels: payload.channels,
  }

  const messagesHtml = renderMessages(payload.messages, ctx)
  const title = escapeHtml(options.title || `Transcript - #${payload.channel.name}`)

  const csp = "default-src 'none'; img-src https: data:; media-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"

  return `<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
  <meta name="referrer" content="no-referrer">
  <title>${title}</title>
  <style>${CSS}</style>
</head>
<body>
  ${renderHeader(options, payload)}
  <main>
    <div class="messages">${messagesHtml}</div>
  </main>
  <footer>Transcript généré par <strong>Zenode Transcript</strong> • ${options.messageCount} message${options.messageCount > 1 ? "s" : ""}</footer>
  <div class="lightbox" id="lightbox"><img id="lightbox-img" alt=""></div>
  <script>${SCRIPT}</script>
</body>
</html>`
}

export function renderTranscript(payload: TranscriptPayload, options: PageOptions): string {
  return renderPage(payload, options)
}
