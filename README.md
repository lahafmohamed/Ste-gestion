# Ste-gestion — Gestion Scierie STE

Application complète de gestion de scierie (teck, Côte d'Ivoire) : contrats SODEFOR,
réception camions (étalage 3 cubages), débitage, stock dérivé, ventes, empotage
conteneurs, comptabilité tiers, rapport quotidien, dashboard.

Feuille de route active : **[stemplan.md](stemplan.md)**.
Formules métier : [FORMULAS.md](FORMULAS.md). Historique & sources : [docs/](docs/) ([PLAN.md](docs/PLAN.md), [REFONTE.md](docs/REFONTE.md), dumps PDF/Excel).

## Structure

```
apps/
  web/      Vite + React + TS + Tailwind   (@ste/web,  port 5173)
  api/      Fastify + Prisma + TS          (@ste/api,  port 3001)
packages/
  shared/   Types & schémas Zod partagés   (@ste/shared)
```

## Prérequis

- Node 20+ (testé 24)
- pnpm 11 (`npm i -g pnpm`)
- PostgreSQL (pour la DB — pas requis pour démarrer l'API scaffold)

## Installation

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # ajuster DATABASE_URL + ADMIN_PASSWORD + JWT_SECRET
pnpm --filter @ste/api prisma:generate
pnpm --filter @ste/api exec prisma migrate deploy   # applique les 11 migrations
```

## Données de démonstration (seed)

```bash
pnpm --filter @ste/api prisma:seed
```

Charge le **camion réel des classeurs Excel** (3201 GS 01, BL 176530, contrat
A3-2026-014) : 60 billes au diamètre (27,294 m³), 275 billons au girth (28,865 m³),
débitage du 15-05 (15,926 m³ · 1369 pièces · rendement 55,17 %), conteneur
MRKU 684202-0 (24,517 m³ · 1101 pièces), plus le contrat de pilotage A3-2026-029
avec ses termes (prix, frais SODEFOR, budgets). ⚠️ Le seed **réinitialise les données
métier** (contrats, camions, sciage, ventes, conteneurs, compta) — les utilisateurs
sont conservés.

## Développement

```bash
pnpm dev          # web + api en parallèle
pnpm dev:web      # front seul  -> http://localhost:5173
pnpm dev:api      # api seule   -> http://localhost:3001
```

Le front proxy `/api/*` vers l'API (voir `apps/web/vite.config.ts`).
Health check : `GET http://localhost:3001/health`.

## Authentification & sécurité

- JWT (12 h). Toutes les routes exigent un token sauf `/health` et `POST /auth/login`.
  Le front rejette un token expiré (déconnexion auto).
- **Admin initial** créé au premier démarrage si aucun utilisateur : `ADMIN_EMAIL` / `ADMIN_PASSWORD` du `.env` (défaut `admin@local` / `admin123` — **à changer**).
- Rôles : Admin (tout), Bureau (contrats, compta), Parc (camions/étalage, conteneurs), Scierie (débitage), Export (ventes, conteneurs). Lecture libre pour tout utilisateur connecté.
- Gestion des comptes : page **Utilisateurs** (admin) ou `POST /users`.
- **Production** (`NODE_ENV=production`) : `JWT_SECRET` fort obligatoire (≥32 car., non défaut)
  sinon l'API refuse de démarrer ; `CORS_ORIGIN` définit les origines autorisées
  (vide = cross-origin refusé). Voir `apps/api/.env.example`.

## Tests

```bash
pnpm test        # formules F1–F6, classement tailles, splits, montant vente + régression seed (vitest)
pnpm test:e2e    # smoke /summary contre l'API démarrée + seedée (chiffres Excel bout en bout)
```

## Scripts

| Commande | Effet |
|----------|-------|
| `pnpm build` | build tous les packages |
| `pnpm typecheck` | typecheck tous les packages |
| `pnpm test` | tests unitaires (formules métier) |
| `pnpm test:e2e` | smoke E2E summary (API + seed requis) |
| `pnpm --filter @ste/api prisma:migrate` | migration DB |
| `pnpm --filter @ste/api prisma:seed` | données de démo (camion réel) |
| `pnpm --filter @ste/api prisma:studio` | Prisma Studio |

## Notes

- Le port API par défaut est **3001** (3000 souvent occupé).
- Base de données : Prisma + PostgreSQL — 17 tables (contrats, camions, packing list
  grumes, étalages, grumes, sciage, avivés, ventes, conteneurs + camions liés, tiers,
  compta, utilisateurs).
- Conventions : UI en français, code/DB en anglais (voir PLAN.md §2).
