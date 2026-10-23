# Contributing — Zenode Transcript

Merci de contribuer ! Ce dépôt suit des règles strictes pour rester simple, sûr et déployable sans base de données.

## Avant de commencer

1. Lire `AGENTS.md` (règles des agents IA) et `README.md` (architecture, API, sécurité).
2. Vérifier `TODO.md` pour l'état du travail en cours.
3. Node.js ≥ 20, `npm ci`.

## Workflow

```text
Code → npm run build → bump patch package.json → git add (code + package.json) → commit
```

- `npm run build` est la **seule validation automatique** (pas de linter, pas de tests). Elle doit passer sans erreur.
- **Chaque commit incrémente `package.json` de +1 patch** et inclut `package.json`.
- Messages de commit au format **Conventional Commits** : `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- Commits atomiques : une étape logique = un commit.
- Branches : `feature/…`, `fix/…`, `refactor/…`, `docs/…`. Ne jamais pousser directement sur `main` sans validation.
- Mettre à jour `README.md` / `README_en.md` si l'installation, la configuration, l'API ou l'architecture change.

## Style

- TypeScript strict, ESM NodeNext, imports relatifs avec `.js`.
- 2 espaces, pas de point-virgule.
- `import type` pour les types.
- Classes + injection de dépendances pour `server/`, `storage/`, `discord/` ; fonctions pures pour `shared/` et `render/`.
- Erreurs : `error instanceof Error ? error.message : String(error)`.
- Constantes `UPPER_SNAKE` avec unité (`DEFAULT_TTL_MS`, `MAX_BODY_BYTES`).

## Sécurité (non négociable)

- Ne jamais committer `.env`, `data/` ou un secret. `.env.example` ne contient que des noms de variables.
- Ne jamais logger de token, clé API, signature ou contenu de message.
- Tout texte utilisateur doit être échappé ; toute URL doit être validée (`http`/`https`).
- Ne pas élargir l'allowlist CDN des assets sans justification (SSRF).
- Toute nouvelle route doit être explicitement authentifiée (API key ou lien signé) et limitée en taille.
- Les erreurs renvoyées au client ne doivent jamais contenir de stack trace ni de secret.

## Pull requests

- Décrire le changement, les scénarios testés manuellement et l'impact sécurité.
- Inclure la version bumpée et la mise à jour de la documentation.
- Ne pas inclure `dist/`, `data/`, `.env` ni les rapports de logs.
