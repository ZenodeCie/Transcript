# TODO — Zenode Transcript

## En cours — Socle du service
- [x] Scaffold TypeScript strict (package.json, tsconfig, .gitignore, ecosystem, .env.example)
- [x] Configuration `.env` validée au boot (secrets obligatoires, TTL, limites)
- [x] Logger préfixé + redaction des secrets
- [x] Types + guards du format de transcript
- [x] Renderer HTML complet (markdown Discord, mentions, embeds, composants V1/V2, réponses, réactions, polls, forwards, stickers, pièces jointes)
- [x] Page HTML self-contained (CSP, thème Discord, recherche, timestamps localisés, spoilers)
- [x] Client REST Discord (pagination, 429/5xx, timeout) + normalisation des messages bruts
- [x] Incrustation des pièces jointes (plafonds, allowlist CDN, concurrence)
- [x] Stockage JSON atomique 0600 + index + purge TTL
- [x] Liens signés HMAC (exp + sig) + vérification temps constant
- [x] Serveur HTTP (auth API key, rate limit, CORS optionnel, health, erreurs JSON)
- [x] CLI de génération statique (fetch Discord ou payload JSON)
- [x] Documentation FR/EN + CONTRIBUTING + AGENTS/TODO/LOGS

## Validation manuelle restante
- [ ] `npm run build` sans erreur sur une machine propre (`npm ci`)
- [ ] Création via fetch Discord réel (`POST /v1/transcripts` avec `channelId`)
- [ ] Création via JSON brut (sans token Discord)
- [ ] Lien signé valide → 200 ; signature falsifiée → 403 ; lien expiré → 410 ; transcript purgé → 404
- [ ] Clé API absente/fausse → 401 ; rate limit → 429
- [ ] Rendu visuel : markdown, mentions, emojis custom, timestamps, spoilers, embeds, boutons/selects, containers V2, réponses, réactions, polls, forwards, stickers, images/vidéos/fichiers
- [ ] Pièces jointes incrustées après expiration des URLs CDN Discord
- [ ] Purge automatique (TTL court) + redémarrage (index reconstruit)
- [ ] Aucun secret dans les logs (`grep` sur `API_KEY`, `SIGNING_SECRET`, token)
- [ ] PM2 start/stop/logs + arrêt propre (SIGINT/SIGTERM)
- [ ] README : toutes les routes et variables à jour

## En cours — Liens publics
- [x] `resolvePublicBase()` : URL absolue depuis `PUBLIC_URL` ou la requête (`Host`, `X-Forwarded-Proto`) | commit local non poussé [2026-10-24 12:00]
- [x] Route `/bot0000/{guildId}/{channelId}.html` → 302 vers le dernier transcript signé du salon
- [ ] Test réel via proxy HTTPS (`TRUST_PROXY=true`) pour vérifier l'origine des liens

## Déploiement / GitHub
- [ ] Créer le dépôt `ZenodeCie/Transcript` (le remote est déjà configuré, il renvoie `Repository not found`)
- [ ] Push initial de `main` quand les identifiants GitHub sont disponibles
- [ ] Configurer `PUBLIC_URL`, les secrets et le token Discord sur la VM d'hébergement

## Fait (voir LOGS.md)
- [x] Remote `origin` = `https://github.com/ZenodeCie/Transcript.git`, branche `main`
