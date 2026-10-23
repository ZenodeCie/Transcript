# Zenode Transcript

Service web de **transcripts de tickets Discord** pour l'écosystème ZenodeBots. Il transforme un salon Discord (ou des messages fournis en JSON) en une page HTML autonome et fidèle au rendu Discord, consultable via un **lien signé à durée limitée**.

- Rendu complet : markdown Discord, mentions, rôles colorés, emojis custom, timestamps localisés, spoilers, embeds, réponses, réactions, stickers, polls, messages transférés, boutons/selects et **composants V2** (containers, sections, médias).
- Pièces jointes **incrustées** en `data:` pour survivre à l'expiration des URLs CDN Discord.
- Stockage local (JSON `0600`), purge TTL automatique, aucune dépendance runtime.
- API protégée par clé, liens HMAC, CSP stricte, échappement systématique (XSS) et allowlist CDN (SSRF).
- Fonctionne aussi en **CLI** pour produire un fichier HTML statique.

## Sommaire

- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration](#configuration)
- [Lancer le service](#lancer-le-service)
- [API HTTP](#api-http)
- [Format d'entrée](#format-dentrée)
- [Sécurité](#sécurité)
- [Rétention et stockage](#rétention-et-stockage)
- [CLI](#cli)
- [Déploiement PM2](#déploiement-pm2)
- [Tests manuels](#tests-manuels)
- [Limites connues](#limites-connues)

## Architecture

```text
src/
├── index.ts              # Boot, santé, purge, arrêt propre
├── cli.ts                # Génération HTML statique
├── env.ts                # .env + validation
├── logger.ts             # Logs préfixés + redaction
├── shared/               # Types, guards, IDs, durées
├── render/               # Markdown, mentions, embeds, composants, page
├── discord/              # REST, normalisation, fetch, assets
├── storage/              # Store JSON atomique, liens signés
└── server/               # Routage HTTP, auth, rate limit
```

Le flux de création :

```text
POST /v1/transcripts
        │
        ├── messages fournis ─────────────┐
        │                                 ▼
        └── fetch REST Discord ──► normalisation ──► incrustation assets
                                                  │
                                                  ▼
                                   stockage data/transcripts/{id}.json
                                                  │
                                                  ▼
                              lien signé /t/{id}?exp=…&sig=…
                                                  │
                                                  ▼
                                         page HTML autonome
```

## Prérequis

- **Node.js ≥ 20** (fetch natif, `AbortSignal.timeout`, ESM).
- Aucune base de données.
- Un token de bot Discord **uniquement** si vous laissez le service aller chercher les messages lui-même. Sinon, le service accepte des messages bruts en JSON.

## Installation

```bash
git clone https://github.com/ZenodeCie/Transcript.git
cd Transcript
npm ci
cp .env.example .env
# renseigner API_KEY et SIGNING_SECRET (voir ci-dessous)
npm run build
npm start
```

Génération des secrets :

```bash
openssl rand -hex 32   # API_KEY
openssl rand -hex 48   # SIGNING_SECRET
```

## Configuration

Toutes les variables sont lues depuis l'environnement, avec chargement optionnel d'un fichier `.env` à la racine (les variables déjà définies dans le processus sont prioritaires).

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Interface d'écoute HTTP. |
| `PORT` | `8787` | Port HTTP. |
| `PUBLIC_URL` | — | Base publique des liens signés (ex. `https://transcripts.example.com`), sans slash final. Si vide, l'origine est dérivée de la requête. |
| `TRUST_PROXY` | `false` | Fait confiance à `X-Forwarded-Proto` / `X-Forwarded-For`. À activer uniquement derrière un reverse proxy maîtrisé. |
| `API_KEY` | — | **Obligatoire.** Clé des routes de gestion (`X-API-Key` ou `Authorization: Bearer`). |
| `SIGNING_SECRET` | — | **Obligatoire.** Secret HMAC des liens de consultation. |
| `DATA_DIR` | `./data` | Dossier de stockage des transcripts. |
| `DEFAULT_TTL` | `7d` | Durée de vie par défaut (`30m`, `24h`, `7d`, ou millisecondes). |
| `MAX_TTL` | `30d` | Durée de vie maximale acceptée. |
| `PURGE_INTERVAL_MS` | `3600000` | Fréquence de purge des transcripts expirés. |
| `MAX_BODY_BYTES` | `33554432` | Taille maximale du corps JSON (32 Mio). |
| `MAX_MESSAGES` | `10000` | Nombre maximal de messages par transcript. |
| `RATE_LIMIT_PER_MINUTE` | `30` | Créations maximales par minute et par clé/IP. |
| `DISCORD_BOT_TOKEN` | — | Token REST pour le fetch d'un salon (optionnel). |
| `DISCORD_API_BASE` | `https://discord.com/api/v10` | Base de l'API Discord. |
| `FETCH_CONCURRENCY` | `4` | Concurrence des appels Discord et des téléchargements d'assets. |
| `INLINE_ASSETS` | `true` | Incruste les pièces jointes en `data:`. |
| `MAX_ASSET_BYTES` | `8388608` | Taille max par pièce jointe incrustée (8 Mio). |
| `MAX_TOTAL_ASSET_BYTES` | `33554432` | Taille max cumulée des pièces jointes d'un transcript (32 Mio). |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`. |
| `CORS_ORIGIN` | — | Origine autorisée pour les appels navigateur ; vide = aucun CORS. |

Le service **refuse de démarrer** si `API_KEY` ou `SIGNING_SECRET` est absent, ou si une valeur est invalide (message explicite, aucun secret affiché).

## Lancer le service

```bash
npm run build
npm start
# ou en développement (compile en continu, ne lance rien) :
npm run dev
```

Au démarrage, le service :

1. valide l'environnement et vérifie Node ≥ 20 ;
2. crée `DATA_DIR/transcripts` (`0700`) et reconstruit son index ;
3. purge les transcripts expirés ;
4. démarre le serveur HTTP et la purge périodique ;
5. gère `SIGINT`/`SIGTERM` (arrêt propre, fermeture des connexions).

## API HTTP

Authentification des routes de gestion : `X-API-Key: <API_KEY>` ou `Authorization: Bearer <API_KEY>`.
Les pages `/t/…` utilisent uniquement le lien signé.

| Méthode | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | — | Santé du service (public, sans secret). |
| `GET` | `/` | — | Nom et version du service. |
| `POST` | `/v1/transcripts` | API key | Crée un transcript (fetch Discord ou messages JSON). |
| `GET` | `/v1/transcripts` | API key | Liste paginée des métadonnées (`?limit=20&offset=0`). |
| `GET` | `/v1/transcripts/:id` | API key | Métadonnées + payload JSON complet. |
| `DELETE` | `/v1/transcripts/:id` | API key | Supprime un transcript. |
| `GET` | `/t/:id?exp=…&sig=…` | Lien signé | Page HTML du transcript. |

### Créer un transcript depuis Discord

```bash
curl -sS -X POST "$BASE/v1/transcripts" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "123456789012345678",
    "guildId": "987654321098765432",
    "title": "Ticket #42 — Vyral",
    "expiresIn": "7d"
  }'
```

Réponse `201` :

```json
{
  "id": "V1StGXR8_Z5jdHi6",
  "url": "https://transcripts.example.com/t/V1StGXR8_Z5jdHi6?exp=1790000000&sig=…",
  "createdAt": "2026-10-23T12:00:00.000Z",
  "expiresAt": "2026-10-30T12:00:00.000Z",
  "messageCount": 128,
  "sizeBytes": 2456789
}
```

### Créer un transcript depuis des messages JSON

`messages` est un tableau d'objets **bruts de l'API Discord** (ceux retournés par `GET /channels/:id/messages`). Les contextes `channel`, `guild`, `roles`, `members` et `bot` sont optionnels mais améliorent le rendu (nom du salon, couleurs de rôles, pseudos, avatars).

```bash
curl -sS -X POST "$BASE/v1/transcripts" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "channelId": "123456789012345678",
    "title": "Ticket #42",
    "channel": { "id": "123456789012345678", "name": "ticket-0042", "type": 0 },
    "guild": { "id": "987654321098765432", "name": "Zenode", "icon": "a_…" },
    "roles": [{ "id": "111", "name": "Staff", "color": 3447003, "position": 5 }],
    "messages": [
      {
        "id": "222",
        "channel_id": "123456789012345678",
        "author": { "id": "333", "username": "vyral", "global_name": "Vyral", "avatar": "…", "bot": false },
        "content": "Bonjour **tout le monde** !",
        "timestamp": "2026-10-23T11:58:00.000Z",
        "edited_timestamp": null,
        "type": 0,
        "embeds": [],
        "attachments": [],
        "components": [],
        "mentions": { "users": [], "roles": [], "channels": [] }
      }
    ]
  }'
```

Champs acceptés à la racine :

| Champ | Type | Requis | Détail |
| --- | --- | --- | --- |
| `channelId` | snowflake | oui | Salon du ticket. |
| `guildId` | snowflake | non | Déduit du salon en mode fetch. |
| `title` | string | non | Titre affiché (≤ 200 caractères, contrôles retirés). |
| `expiresIn` | duration | non | `30m`, `24h`, `7d`, ou millisecondes ; plafonné par `MAX_TTL`. |
| `messages` | array | non | Messages bruts Discord. Absent → fetch REST (token requis). |
| `channel` | object | non | `id`, `name`, `topic`, `type`, `parent_id`. |
| `guild` | object | non | `id`, `name`, `icon`. |
| `roles` | array | non | `id`, `name`, `color`, `position`, `colors`. |
| `members` | array | non | `user`, `nick`, `avatar`, `roles`. |
| `bot` | object | non | `id`, `username`, `avatar` (badge du bot dans l'en-tête). |

### Erreurs

Format uniforme :

```json
{ "error": { "code": "invalid_payload", "message": "…" } }
```

| Statut | Codes principaux |
| --- | --- |
| `400` | `invalid_json`, `invalid_payload`, `invalid_channel_id`, `invalid_expiry`, `discord_not_configured` |
| `401` | `unauthorized` |
| `403` | `invalid_signature` |
| `404` | `not_found` |
| `405` | `method_not_allowed` |
| `410` | `expired` |
| `413` | `body_too_large` |
| `415` | `unsupported_media_type` |
| `429` | `rate_limited` |
| `502` | `discord_error` |
| `500` | `internal_error` |

## Format d'entrée

Le service accepte les objets **bruts Discord** et les normalise. Les champs suivants sont exploités :

- message : `id`, `channel_id`, `author`, `member`, `content`, `timestamp`, `edited_timestamp`, `type`, `pinned`, `webhook_id`, `mentions`, `mention_roles`, `mention_channels`, `referenced_message`, `embeds`, `attachments`, `components`, `sticker_items`, `reactions`, `poll`, `interaction`, `message_snapshots`.
- embed : `author`, `title`, `description`, `url`, `color`, `fields`, `thumbnail`, `image`, `footer`, `timestamp`.
- composants : types 1 (action row), 2 (bouton), 3 (string select), 5–8 (selects user/rôle/mentionnable/salon), 9 (section), 10 (text display), 11 (thumbnail), 12 (media gallery), 13 (file), 14 (separator), 17 (container).
- pièces jointes : `id`, `filename`, `url`, `proxy_url`, `content_type`, `size`, `width`, `height`.

Les messages inconnus ou partiels ne cassent jamais le rendu : les champs absents sont ignorés et un avertissement est loggé.

## Sécurité

- **Clé API** comparée en temps constant (`timingSafeEqual` sur des digests SHA-256).
- **Liens signés** : `sig = base64url(HMAC-SHA256(SIGNING_SECRET, "{id}.{exp}"))`, comparaison en temps constant. Toute modification de l'ID ou de l'expiration invalide le lien.
- **XSS** : échappement HTML systématique, URLs validées (`http`/`https`), aucun HTML utilisateur, CSP stricte (`default-src 'none'`, CDN autorisé uniquement pour le script de rendu).
- **SSRF** : les assets ne sont téléchargés que depuis les hôtes Discord connus, sans suivre de redirection.
- **Secrets** : jamais loggés, jamais renvoyés par l'API, jamais écrits dans `DATA_DIR`.
- **Stockage** : fichiers `0600`, dossier `0700`, écriture atomique (temp + rename).
- **Réponses** : `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- **Rate limit** : token bucket en mémoire par clé/IP ; `Retry-After` renvoyé en cas de dépassement.

> Les pages de transcript contiennent des conversations privées : ne partagez les liens signés qu'aux personnes concernées, utilisez HTTPS et un TTL court pour les données sensibles.

## Rétention et stockage

- Un fichier par transcript : `DATA_DIR/transcripts/{id}.json` (`version`, `meta`, `payload`).
- `expiresAt = createdAt + TTL` ; le lien signé porte la même expiration.
- Purge : au démarrage, toutes les heures (`PURGE_INTERVAL_MS`), et à la lecture (un transcript expiré renvoie `410` puis est supprimé).
- Index en mémoire reconstruit au boot (métadonnées uniquement) pour la liste et les statistiques.
- `GET /health` expose le nombre de transcripts et l'espace utilisé, jamais les chemins ni les contenus.

## CLI

Génère un HTML statique, sans serveur ni clé API :

```bash
npm run build

# Depuis un salon Discord (DISCORD_BOT_TOKEN requis)
node dist/cli.js --channel 123456789012345678 --out ticket.html --title "Ticket #42"

# Depuis un fichier JSON (même format que le corps de POST /v1/transcripts)
node dist/cli.js --payload ticket.json --out ticket.html

# Options
#   --max-messages <n>   limite de messages
#   --no-inline          ne pas télécharger les pièces jointes
#   --help
```

Le HTML produit est autonome (hors script de rendu CDN et polices système) et peut être archivé ou envoyé par e-mail.

## Déploiement PM2

```bash
npm ci
npm run build
npm run pm2:start
npm run pm2:logs
```

`ecosystem.config.cjs` définit `zenode-transcript` (fork, autorestart, limite mémoire 512 Mo). Placez le service derrière un reverse proxy HTTPS (nginx/Caddy) et définissez `PUBLIC_URL` + `TRUST_PROXY=true`.

## Tests manuels

1. **Build** : `npm run build` sans erreur.
2. **Santé** : `curl -s http://127.0.0.1:8787/health`.
3. **Auth** : `POST /v1/transcripts` sans clé → `401` ; avec une mauvaise clé → `401`.
4. **Création JSON** : envoyer 2–3 messages avec markdown, embed, bouton, select, image ; vérifier le `201` et l'URL.
5. **Rendu** : ouvrir l'URL ; vérifier pseudos/avatars/couleurs, markdown, mentions, emojis, timestamps localisés, spoilers cliquables, réponses (saut de message), réactions, embeds, composants, pièces jointes.
6. **Signature** : modifier `sig` → `403` ; supprimer `sig` → `403` ; attendre l'expiration (TTL court) → `410`.
7. **Suppression** : `DELETE /v1/transcripts/:id` → `204`, puis l'URL → `404`.
8. **Fetch Discord** : avec `DISCORD_BOT_TOKEN`, créer depuis un vrai salon ; vérifier l'ordre chronologique et la pagination (> 100 messages).
9. **Assets** : après expiration des URLs CDN, rouvrir le HTML ; les images doivent encore s'afficher (incrustation).
10. **Limites** : corps > `MAX_BODY_BYTES` → `413` ; `expiresIn` > `MAX_TTL` → `400` ; > `MAX_MESSAGES` → `400`.
11. **Logs** : aucun token, clé API, signature ou contenu de message.
12. **Arrêt** : `SIGINT` → arrêt propre, pas de fichier temporaire résiduel.

## Limites connues

- Le rendu des composants repose sur le web component `@derockdev/discord-components-core` chargé depuis jsDelivr ; sans réseau, le contenu reste lisible mais le style Discord des messages peut être dégradé.
- Les messages antérieurs à la conservation du salon ne peuvent pas être récupérés.
- Les réactions affichent les compteurs connus au moment du fetch (pas de mise à jour temps réel).
- Les threads ne sont pas fusionnés automatiquement dans le transcript du salon parent.
- Les pièces jointes dépassant les plafonds restent des liens externes (qui peuvent expirer).
