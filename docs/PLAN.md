# Plan du projet — Gestion Scierie (Ste-gestion)

> ⚠️ **2026-07-13 : refonte EXÉCUTÉE — voir [REFONTE.md](REFONTE.md)** (saisie unique à la source, agrégats dérivés via `/contracts/:id/summary`, navigation par étape métier). REFONTE.md prime sur les sections contradictoires ci-dessous.
> Statut : **en développement**. Modules livrés : Contrats (termes), Réception, Débitage, Cutting, Stock (dérivé), Ventes, **Empotage/Conteneurs** (F3, plomb, statut PLANNED→SHIPPED horodaté), Compta (dûs suggérés), Dashboard. Full cost = Σ dûs tiers (plus saisi).
> Document de référence.
> Convention : **UI en français**, **code / base de données en anglais** (identifiants, tables, colonnes).
> Dernière mise à jour : 2026-06-30.

---

## 1. Contexte métier

Société forestière / scierie en **Côte d'Ivoire**. Devise **FCFA**. Bois : **teck** (teak).
Source de vérité actuelle : classeurs Excel (pdf1, pdf3, pdf4, pdf5, pdf7 — dumps `.md` dégradés).

### Chaîne de valeur (du tronc à l'export)

```
Achat contrat SODEFOR
   → Réception camions (étalage / cubage grumes)
      → Stock parc (grumes non sciées)
         → Débitage scierie (avivés teck, classés par taille)
            → Stock produits finis (par taille)
               → Vente / Export (prix USD, taux CFA)
                  → Comptabilité tiers (payé / devoir)
                     → Analyse rentabilité par contrat (full cost → profit)
```

### Vocabulaire métier (FR) → identifiant (EN)

| Français | Anglais (code) | Définition |
|----------|----------------|------------|
| Contrat (SODEFOR) | `contract` | Droit d'achat/exploitation, ex `A3-2026-029` |
| Camion | `truck` | Chargement de grumes arrivant au parc |
| Grume | `log` | Tronc individuel mesuré |
| Étalage | `tally` / `log_measurement` | Relevé de mesures d'un camion |
| Cubage | `volume` / `cubage` | Volume m³ d'une grume / d'un lot |
| Cubage brousse | `field_volume` | Mesuré en forêt (circonférence) |
| Cubage parc | `yard_volume` | Mesuré au parc (diamètre) |
| Débité | `sawn` / `sawn_board` | Bois scié (avivé) |
| Débitage | `sawing` / `production` | Opération de sciage |
| Rendement | `yield` / `output_rate` | débité ÷ grume (%) |
| Taille | `size` | Catégorie d'avivé (6x4, 6x3, … 1") |
| Main sizes | `main_size` | Tailles principales (export) |
| Side sizes | `side_size` | Tailles secondaires |
| Tiers / Compte | `party` / `account` | SODEFOR, Ibrahim, DCM, client… |
| Payé / Devoir | `paid` / `due` | Réglé / reste dû |
| Reboisement | `reforestation` | Taxe reboisement |
| Protection forêt | `forest_protection` | Taxe protection |
| Bordereau livraison | `delivery_note` (B/L) | Réf ex `176530` |
| Parcelle | `parcel` | Ex `146-99/04` |

---

## 2. Stack technique (validée)

| Couche | Choix | Note |
|--------|-------|------|
| Frontend | **Vite + React + TypeScript** | UI FR, **mobile/tablette first**, PWA |
| Styling | **Tailwind CSS** | base |
| Composants | **shadcn/ui** (Radix) | saisie, tables, dialogs, formulaires |
| Animations | **Aceternity UI** (framer-motion) | **login + landing + dashboard uniquement** |
| i18n | français (UI) | textes FR, données/codes EN |
| Backend | **Node.js + TypeScript** | |
| Framework API | **Fastify** (reco) ou Hono | typé, rapide |
| ORM | **Prisma** | migrations, types auto, MCP dispo |
| Base de données | **PostgreSQL** | `NUMERIC`/`Decimal` exact, ACID, agrégats |
| Validation | **Zod** | schémas partagés front/back |
| Auth | **JWT + rôles** | sessions, refresh token |
| Argent / volumes | **Prisma `Decimal`** | **jamais `float`** |
| Déploiement | front statique + API + Postgres managé | Neon / Supabase / Railway |

### 2.1 Frontend — détail

**Cœur**
- Vite + React 18 + TypeScript, React Router, Tailwind.
- **shadcn/ui** (Radix + lucide-react + sonner) = composants fonctionnels.
- **Aceternity UI** = effets/animations, réservé login/landing/dashboard. **Interdit sur écrans de saisie** (perf mobile + vitesse saisie).

**Données / état**
- **TanStack Query** : appels API, cache, optimistic.
- **Zustand** : état UI local léger.
- **React Hook Form + Zod** : formulaires + validation (Zod partagé front/back).
- Types **Prisma partagés** via `packages/shared` (monorepo pnpm).

**Spécifique métier**
- **TanStack Table** : grilles saisie (étalage, débitage), totaux live.
- **decimal.js** + `Intl.NumberFormat('fr-FR')` : décimaux exacts, format FR (1 234,56).
- **Recharts** (ou Tremor) : dashboard.
- **date-fns** (locale FR) : dates.
- **vite-plugin-pwa** : installable terrain.
- Export **PDF/Excel** : jsPDF / exceljs (ou backend).

**Photos** (voir §4.9 + §2.2)
- **browser-image-compression** : compresse avant upload.
- Capture appareil : `<input type="file" accept="image/*" capture="environment">`.
- Upload direct storage via **presigned URL** (pas via API).

### 2.2 Mobile / tablette first

- Design **petit écran d'abord**, desktop ensuite.
- Saisie : gros boutons, `inputmode="decimal"`, total live, validation par lot.
- **Mobile** = listes/cartes empilées ; **tablette** = grille tableur.
- Cibles tactiles ≥ 44px, pas de hover-only.
- PWA plein écran, icône accueil.
- Test sur tél/tablette réels dès Phase 2.

### 2.3 Stockage photos

| Besoin | Choix |
|--------|-------|
| Stockage objet | **Cloudflare R2** (S3-compat) ou **Supabase Storage** |
| Upload | **presigned URL** (front → storage direct) |
| Compression | browser-image-compression (client) |
| Miniatures | thumb générée |
| Règle | **jamais de blob en DB** ; Postgres stocke seulement l'URL |

### Règles de codage figées

- **Anglais** partout dans le code et la DB. Aucun accent/français dans les identifiants.
- DB en **snake_case**, TS en **camelCase** (mapping Prisma `@map`).
- Montants FCFA : `Decimal(18, 2)`. Volumes m³ : `Decimal(12, 6)`. Pourcentages : `Decimal(6, 4)`.
- Dates en **UTC** (ISO), affichage local FR.
- Tout enregistrement « argent » ou « stock » est **immuable + traçable** (audit).

---

## 3. ⚠️ Bloquants — données à extraire des `.xlsx` (Phase 0)

Formules de calcul confirmées → voir **[FORMULAS.md](../FORMULAS.md)** (source de vérité, lues dans les cellules Excel, vérifiées au chiffre près).

| # | Sujet | Statut | Source |
|---|-------|--------|--------|
| F1 | Cubage grume — **diamètre** : `L_ft × dia_in² × 0.00007854` | ✅ **résolu** | DIAMETRE.xlsx |
| F2 | Cubage grume — **circonférence** : `L_m × circ_cm² / 160000` | ✅ **résolu** | GIRTH.xlsx |
| F3 | Volume **avivé** : `(L_ft × l_in × ép_in / 144 / 35.315) × nbr` | ✅ **résolu** | DEBITES + EMPOTAGES.xlsx |
| F6 | **Rendement** = débité ÷ cubage parc (girth) | ✅ **résolu** | DEBITES.xlsx |
| F11 | CFT = m³ × 35.3 (cubage) / m³ = ft³ ÷ 35.315 (débité) | ✅ résolu (incohérence à uniformiser) | — |
| F4 | Règle classement tailles : MAIN {7"+,6x4,6x3,5x4,5x3} · SIDE {4",2",1.5"} · 1" à part | ✅ **résolu** | dashboard A3-2026-029 |
| F5 | Main vs side (cf F4) | ✅ **résolu** | dashboard A3-2026-029 |
| F7 | Prix : transport = /camion, ibrahim = /m³ cubage ; autres à confirmer | ✅ partiel | dashboard A3-2026-029 |
| F8 | full_cost = Σ(sodeforR+sodefor+ +reboisement+ibrahim+transport+autre) = 71 642 672 ; budgets stockés ; **profit inconnu** | ✅ partiel | dashboard A3-2026-029 |
| F9 | Selling 570 / taux USD-CFA 575 (achat/vente) | ✅ **résolu** | dashboard A3-2026-029 |
| F10 | Ibrahim = cubage (24 000/m³), compte « 067 » | ✅ **résolu** | dashboard A3-2026-029 |

> Blocs vus (dashboard A3-2026-029) → voir **[FORMULAS.md](../FORMULAS.md)**. Reste flou : **formule du profit attendu** (cellule en erreur), unités SODEFOR/company/export.

### Points clés confirmés par les Excel

- **3 cubages par camion** : brousse (manuel, 33.171), parc/girth (F2, 28.865 → rendement), diamètre (F1, 27.294 → contrôle).
- **Unités hétérogènes** : F1 en pieds+pouces, F2 en mètres+cm. → stocker mesures brutes + unité.
- **Empotage** = même formule que débité (F3). Conteneur observé : 1 grade/taille, plomb (seal), total m³ + nb pièces.

---

## 4. Modèle de données (Prisma — esquisse)

> Noms en anglais. `Decimal` pour argent/volume. Relations indicatives.

### 4.1 Référentiels

```
Size                      // référentiel tailles
  id
  code            (ex "6x4", "1\"")
  category        enum: MAIN | SIDE | ONE_INCH
  width_in        Decimal?    // si applicable
  thickness_in    Decimal?
  active          bool

Party                     // tiers (fournisseurs, transporteurs, clients, internes)
  id
  name            (SODEFOR, Ibrahim, DCM, PCA DG, Mahi, client export…)
  type            enum: SUPPLIER | TRANSPORTER | CLIENT | INTERNAL | TAX_AUTHORITY
  contact, notes

ExchangeRate              // taux USD/CFA historisé
  id
  date
  usd_cfa_buy     Decimal
  usd_cfa_sell    Decimal
```

### 4.2 Achat / Contrat

```
Contract
  id
  code            (ex "A3-2026-029")  @unique
  year
  quota_m3        Decimal             // ex 1000
  trucks_planned  int?                // ex 46
  status          enum: OPEN | CLOSED
  opened_at, closed_at
  // frais / config prix → ContractPricing
  // fees figés ci-dessous

ContractFee               // frais liés au contrat
  id, contract_id
  kind            enum: SODEFOR_PURCHASE | FOREST_PROTECTION | REFORESTATION | SODEFOR_PLUS | OTHER
  amount          Decimal (FCFA)
  note

ContractPricing           // paramètres de calcul (unités à confirmer F7)
  id, contract_id
  sodefor_price      Decimal   // 55 000
  ibrahim_price      Decimal   // 24 000
  transport_price    Decimal   // 475 000
  cubage_price       Decimal   // 100 000
  export_price_usd   Decimal   // 90 000 ? (à clarifier)
  one_inch_price     Decimal   // 140 000
  // budgets dérivés (F8) ou stockés
```

### 4.3 Réception / Étalage

```
Truck
  id
  contract_id
  registration    (ex "3201 GS 01")
  delivery_note   (B/L, ex "176530")
  parcel          (ex "146-99/04")
  origin          (ex "SANGOUE")
  arrived_at
  // totaux dérivés : field_volume, yard_volume, log_count

LogMeasurement            // un relevé d'un camion (3 contextes possibles)
  id, truck_id
  context         enum: FIELD | YARD_GIRTH | YARD_DIAMETER
  total_volume_m3 Decimal             // Σ lignes (dérivé)
  measured_at
  // lignes → Log

Log                       // grume individuelle (ligne de mesure)
  id, measurement_id
  position        int                 // log #
  external_id     (ex "283A")?        // num log (brousse/girth)
  // unités selon contexte (cf FORMULAS.md) :
  length          Decimal             // FIELD/GIRTH = mètres ; DIAMETER = pieds
  length_unit     enum: M | FT
  diameter_in     Decimal?            // contexte YARD_DIAMETER (pouces)
  circumference_cm Decimal?           // contexte FIELD/YARD_GIRTH (cm)
  volume_m3       Decimal             // calculé (F1 ou F2)
  cft             Decimal?            // = m3 × 35.3 (diamètre)
```

### 4.4 Production / Débitage

```
ProductionRun            // session de débitage (ex "DEBITE TECK 15-05-2026")
  id
  contract_id
  truck_id?               // si rattaché à un camion/lot
  species         enum: TEAK | OTHER
  produced_at
  total_volume_m3 Decimal              // ex 15.925716 (dérivé)
  piece_count     int                  // ex 1369 (dérivé)

SawnBoardLine            // ligne d'avivés agrégée par dimension
  id, production_run_id
  length_ft       Decimal
  width_in        Decimal
  thickness_in    Decimal
  count           int                  // nbr de lignes/pièces
  size_id         → Size               // classé (F4)
  volume_m3       Decimal              // calculé (F3)
```

### 4.5 Stock

```
StockItem                // état courant (vue/matérialisé)
  contract_id
  kind            enum: LOG_YARD | SAWN
  size_id?                // si SAWN
  volume_m3       Decimal
  // dérivé des mouvements

StockMovement            // journal immuable
  id
  contract_id
  kind            enum: LOG_IN | LOG_TO_SAW | SAWN_IN | SAWN_OUT_SALE | ADJUST
  size_id?
  volume_m3       Decimal
  ref_type, ref_id        // lien vers Truck / ProductionRun / Sale
  occurred_at, created_by
```

### 4.6 Vente / Export

```
Sale
  id
  contract_id
  client_id       → Party
  delivery_note?
  size_id         → Size
  volume_m3       Decimal
  price_usd       Decimal
  exchange_rate_id → ExchangeRate
  amount_cfa      Decimal              // calculé
  sold_at, created_by
```

### 4.7 Comptabilité tiers

```
Account                  // compte par tiers (×contrat ?)
  id, party_id, contract_id?
  // solde dérivé : total_due, total_paid, balance

Payment                  // journal des paiements
  id
  account_id / party_id
  contract_id?
  amount          Decimal
  direction       enum: OUT | IN
  description     (PCA DG, DCM, Mahi, Sodefor Contrat, Reboissement, "20m cash"…)
  paid_at, created_by
```

### 4.9 Conteneurs / Empotage

```
Container                 // conteneur d'export
  id
  contract_id?
  client_id        → Party
  container_no     (ex "MRKU 684202-0")
  seal_no          (plomb, ex "ML-CI 1238871")
  booking_no
  grade            (ex "B GRADE")?
  status           enum: PLANNED | LOADING | LOADED | SHIPPED
  total_volume_m3  Decimal            // Σ items (dérivé)
  piece_count      int                // Σ count (dérivé)
  loaded_at, shipped_at, created_by

ContainerItem             // lignes d'avivés chargées (même calc que débité F3)
  id, container_id
  size_id          → Size
  length_ft, width_in, thickness_in   Decimal
  count            int
  volume_m3        Decimal            // F3
  // lien possible vers Sale

Photo                     // photos (transversal)
  id
  entity_type      enum: CONTAINER | LOG | TRUCK | PRODUCTION | OTHER
  entity_id
  url, thumb_url
  caption?, gps?, taken_at
  uploaded_by
```

### 4.10 Transverse

```
User       (id, name, email, password_hash, role)
AuditLog   (id, user_id, action, entity, entity_id, diff_json, at)
```

---

## 5. Règles de gestion (à valider avec formules)

1. **Cubage grume** : `volume_m3 = f(longueur, diamètre|circonférence)` — F1/F2. Deux contextes (brousse/parc) → deux totaux par camion.
2. **Rendement parc** = `total_débité ÷ cubage_parc` (ex 0.5517 / 55 %). À confirmer numérateur/dénominateur (F6).
3. **Classement taille** : dimensions (l × ép) → `size_code` via table de règles (F4). Main vs side (F5).
4. **Volume avivé** = `f(L_ft, l_in, ép_in) × count` — F3.
5. **Stock parc** = Σ grumes entrées − Σ grumes débitées.
6. **Stock produit** = Σ débité par taille − Σ vendu par taille.
7. **Montant vente CFA** = `volume × prix_usd × taux_usd_cfa`.
8. **Solde tiers** = Σ dû − Σ payé (ex Ibrahim : 11 455 784 dû − 20 000 000 payé = −8 544 216).
9. **Full cost contrat** = Σ (SODEFOR&R + SODEFOR+ + reboisement + Ibrahim + transport + sous-cubage). Ex 70 130 784.
10. **Profit attendu** = budgets − coûts (F8).
11. **Cohérence** : un camion appartient à 1 contrat ; tout mouvement stock rattaché à 1 contrat.

---

## 6. Modules & écrans (UI française)

| Module | Écrans | Rôle principal |
|--------|--------|----------------|
| **Tableau de bord** | KPI globaux + par contrat | Tous (lecture) |
| **Contrats** | liste, fiche, frais, paramètres prix | Bureau/Admin |
| **Réception** | nouveau camion, saisie étalage (grume par grume), cubage auto | Parc |
| **Production** | nouvelle session débitage, saisie lignes avivés, rendement | Scierie |
| **Stock** | grumes parc, produits par taille, mouvements | Bureau/Parc |
| **Ventes / Export** | bordereaux, prix USD, taux change | Export |
| **Conteneurs / Empotage** | conteneurs, contenu chargé, **photos chargement** | Export/Parc |
| **Comptabilité** | comptes tiers, paiements, payé/devoir | Bureau/Admin |
| **Rentabilité** | full cost, profit/contrat, budgets | Admin |
| **Paramètres** | tailles, tiers, taux USD, utilisateurs | Admin |

### Écrans de saisie clés (ergonomie terrain)

- **Étalage camion** : tableau saisie rapide (clavier numérique mobile), volume calculé en direct, total + moyenne en bas, validation lot.
- **Débitage** : grille par dimension, regroupement auto par taille, % rendement live.

---

## 7. Rôles & permissions

| Rôle | Contrats | Réception | Production | Stock | Ventes | Conteneurs | Compta | Rentabilité | Paramètres |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Admin** | RW | RW | RW | RW | RW | RW | RW | R | RW |
| **Bureau** | RW | R | R | RW | R | R | RW | R | R |
| **Parc** | R | RW | R | R | – | RW | – | – | – |
| **Scierie** | R | R | RW | R | – | – | – | – | – |
| **Export** | R | – | – | R | RW | RW | R | – | – |

(R = lecture, W = écriture, – = aucun accès)

---

## 8. API (REST — esquisse)

```
POST   /auth/login                  GET /auth/me
CRUD   /contracts                   GET /contracts/:id/summary
CRUD   /contracts/:id/fees
CRUD   /trucks                      POST /trucks/:id/measurements
CRUD   /logs                        (bulk insert étalage)
CRUD   /production-runs             POST /production-runs/:id/lines (bulk)
GET    /stock?contract=&kind=
GET    /stock/movements
CRUD   /sales
CRUD   /containers                  POST /containers/:id/items
POST   /photos/presign              (URL upload direct storage)
CRUD   /photos?entity_type=&entity_id=
CRUD   /parties                     GET /parties/:id/account
CRUD   /payments
CRUD   /sizes
CRUD   /exchange-rates
GET    /reports/yield?contract=
GET    /reports/cost-analysis?contract=
GET    /reports/profit?contract=
GET    /dashboard/kpi
```

Toutes les écritures → `AuditLog`. Validation Zod en entrée. Types Prisma partagés.

---

## 9. Indicateurs (Dashboard)

- Rendement moyen (%) global + par contrat + par camion.
- Stock parc (m³ grumes non sciées) + nb camions restants.
- Stock produits par taille (m³).
- Volume débité (jour / contrat).
- Export réalisé vs budget (USD + CFA).
- Trésorerie tiers : total payé / total devoir / solde par tiers.
- Full cost vs profit attendu par contrat.

---

## 10. Exigences non fonctionnelles

- **Précision décimale** : aucun arrondi non maîtrisé (FCFA + volumes).
- **Traçabilité** : qui a saisi quoi, quand (AuditLog).
- **Mobile / tablette first + PWA** : saisie terrain scierie parfaitement utilisable sur tél/tablette.
- **Photos** : capture appareil, compression client, upload presigned URL, jamais de blob en DB.
- **i18n FR** : interface française, formats nombres FR (espace milliers, virgule décimale).
- **Sauvegarde** : backup DB régulier (managé).
- **Exports** : PDF/Excel des bordereaux et rapports (étalage, rendement, rentabilité).
- **Sécurité** : hash mots de passe (argon2/bcrypt), JWT, RBAC, HTTPS.
- **Performance** : vues matérialisées pour dashboard si volume élevé.

---

## 11. Roadmap par phases

| Phase | Contenu | Livrable | Pré-requis |
|-------|---------|----------|-----------|
| **0 — Specs** | Extraire formules `.xlsx` (F1–F11), figer référentiel tailles, valider modèle Prisma | Spec gelée | `.xlsx` déposés |
| **1 — Socle** | Scaffold Vite + Fastify + Prisma + Postgres, auth/rôles, CRUD Contrats | App qui tourne, login | Phase 0 |
| **2 — Réception** | Camions + étalage grumes, cubage auto (dia & circ) | Saisie réception | F1, F2 |
| **3 — Production** | Débitage, volume avivé, classement tailles, rendement | Saisie production | F3, F4, F6 |
| **4 — Stock** | État parc + produits, mouvements | Vue stock | Phases 2-3 |
| **5 — Ventes/Conteneurs/Compta** | Export USD, conteneurs + **photos empotage**, comptes tiers, paiements | Ventes + compta + photos | F9, storage R2 |
| **6 — Rentabilité** | Full cost, profit/contrat, budgets, dashboard KPI | Reporting complet | F7, F8 |
| **7 — Finitions** | Exports PDF/Excel, PWA, durcissement, sauvegarde | Mise en prod | — |

---

## 12. Questions ouvertes (à trancher)

1. Un camion peut-il alimenter **plusieurs débitages** / une session de débitage mélange-t-elle plusieurs camions ? (lien Truck ↔ ProductionRun : 1-N ou N-N ?)
2. Cubage brousse et parc : **toujours les deux** par camion, ou parfois un seul ?
3. Longueurs grumes : **pieds** (parc) vs **mètres** (brousse) — normaliser en interne ?
4. « Ibrahim » : un seul tiers (transport + cubage) ou plusieurs lignes de coût ?
5. Prix (55 000, 24 000…) : **par m³, par camion, ou par pièce** ? (F7)
6. Gestion **multi-devises** export (USD↔CFA) : taux figé à la vente ou recalculé ?
7. Besoin **hors-ligne** réel sur terrain, ou responsive suffit (internet stable) ?
8. Numérotation auto des bordereaux/lots souhaitée ?
9. Plusieurs essences à terme ou **teck uniquement** ?
10. Historique/migration des **données Excel existantes** à importer ?
11. Storage photos : **Cloudflare R2** ou **Supabase Storage** ? Rétention/limite taille ?
12. Photos : seulement **conteneurs** au début, ou aussi grumes/débitage dès le départ ?
13. Conteneur lié à **1 contrat** ou peut mélanger plusieurs contrats/clients ?

---

## 13. Prochaine étape

1. **Déposer les `.xlsx`** → extraction formules (Phase 0, bloquant).
2. Répondre aux **questions ouvertes** (§12).
3. Valider/ajuster ce modèle de données (§4).
→ Ensuite seulement : scaffold Phase 1.
</content>
</invoke>
