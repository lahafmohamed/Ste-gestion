# REFONTE — De « suivi de contrat » à « gestion de scierie »

> Statut : ✅ **EXÉCUTÉE** (2026-07-13). Migration `refonte_pipeline`. E2E vérifié au chiffre près.
> Réf : [PLAN.md](PLAN.md), [FORMULAS.md](../FORMULAS.md).
> Date plan : 2026-07-12.
>
> **E2E validé** : 2 camions + girth → débitage lié camion 1 → summary (entrés 2, scié 1, **stock parc = girth camion 2**) → vente 6x4 (stock baisse, CA = m³×USD×taux) → suggestions dûs (transport 2×475k=950k, cubage girth×24k) → appliquées → **full cost = Σ dûs** → solde/profit. Tout dérivé, rien tapé.

## 0. Principes

1. **Saisie unique à la source** : une donnée est saisie une seule fois, à l'étape métier où elle naît (réception, débitage, vente, paiement). Tout agrégat est **calculé**, jamais tapé.
2. **Le contrat ne stocke que ses termes** (quota, prix, frais négociés). Son état opérationnel est dérivé des opérations.
3. **Journal immuable** : étalages, lignes débitées, ventes, écritures — on crée/supprime, on ne modifie pas silencieusement.
4. **UI par étape métier** : navigation Réception / Débitage / Stock / Ventes / Compta / Dashboard (chaque rôle terrain a sa page), la fiche contrat devient une **vue pipeline**.

---

## 1. Modèle de données cible

### 1.1 Contract — allégé (termes seulement)

**Champs saisis (conservés/renommés) :**

| Champ | Note |
|---|---|
| code, year, status, note | inchangés |
| quotaM3 | terme du contrat (ex 1000) |
| `trucksPlanned` | **rename** de trucksTotal (ex 47 — terme) |
| sodeforPrice, ibrahimPrice, transportPrice, cubagePrice, companyPrice, exportPrice, sellingPriceUsd, usdCfaRate, oneInchPrice | paramètres de prix (inchangés) |
| `feeSodeforR`, `feeSodeforPlus`, `feeReforestation` | **rename** de costSodeforR/Plus/Reforestation — frais fixes du contrat (42,5M / 7,5M / 2,5M) |
| woodBudget, companyBudget, exportBudget, expectedProfit | budgets (F8 formule inconnue → saisis) |
| `sodeforPartyId?`, `cubagePartyId?`, `transportPartyId?` | **nouveau** — tiers assignés, activent les suggestions de dûs |

**Champs SUPPRIMÉS (deviennent dérivés) :**

| Supprimé | Remplacé par |
|---|---|
| trucksEntered | `count(Truck)` |
| trucksOnParcUncut | camions entrés − camions sciés |
| pieceCount | Σ grumes des étalages parc (girth) |
| debitedM3 | Σ lignes débitées |
| outputCircPct | débité ÷ cubage girth (F6) |
| exportSizesCost | dérivé plus tard (coût/m³ export) |
| costIbrahim, costTransport, costOther | Σ dûs (DUE) des comptes tiers |

→ `derive.ts` (recompute vers colonnes stockées) **supprimé** — tout est calculé live par `/summary`.

### 1.2 ProductionRun ↔ Truck — lien N-N

```
ProductionRunTruck   (run_id, truck_id) @@id
```

- Une session peut scier plusieurs camions ; un camion peut être scié sur plusieurs jours.
- **Camion « scié »** = lié à ≥ 1 session. « Sur parc non scié » = entré et jamais lié.
- Saisie débitage : sélection des camions concernés (facultative — session sans lien reste valide).

### 1.3 Sale + SaleLine — nouveau (ventes / export)

```
Sale
  id, contractId FK, clientId? → Party, saleDate, deliveryNote?, note?
  lines SaleLine[]

SaleLine
  id, saleId FK, position
  sizeCode        (ex "6x4", "1\"")
  volumeM3        Decimal(12,6)   — saisi
  unitPriceUsd?   Decimal(18,2)   — défaut : sellingPriceUsd du contrat
  usdCfaRate?     Decimal(10,4)   — défaut : usdCfaRate du contrat
  unitPriceCfa?   Decimal(18,2)   — vente locale directe (ex 1" à 140 000 CFA/m³)
  amountCfa       Decimal(18,2)   — CALCULÉ : m³ × (unitPriceCfa OU unitPriceUsd × taux)
```

Règle : soit USD+taux, soit CFA direct (validation Zod XOR). Montant calculé serveur.

### 1.4 Inchangés

Truck, LogMeasurement, Log, SawnLine, Party, AccountEntry. Container/Photo/User = phase suivante (hors refonte).

---

## 2. Dérivations — endpoint unique `GET /contracts/:id/summary`

Toutes les requêtes en parallèle, calcul en mémoire :

| Dérivé | Formule |
|---|---|
| trucksEntered | count(trucks) |
| trucksSawn | count(trucks liés à ≥1 run) |
| trucksOnParcUncut | entered − sawn |
| trucksRemaining | trucksPlanned − entered |
| totalUncut | remaining + onParcUncut |
| logCount (# pieds mesurés) | Σ grumes étalages YARD_GIRTH |
| fieldM3 / girthM3 / diaM3 | Σ volumes par contexte |
| debitedM3 | Σ SawnLine.volumeM3 |
| outputPct (F6) | debitedM3 ÷ girthM3 |
| cutting par taille | existant (Σ par sizeCode) |
| soldBySize | Σ SaleLine.volumeM3 par taille |
| **stockBySize** | cutting − sold (par taille, + total) |
| **stockParcM3** | Σ girth des camions **non sciés** |
| accounts | dû / payé / solde par tiers (existant) |
| **fullCost** | Σ DUE tous tiers confondus |
| salesRevenueCfa | Σ SaleLine.amountCfa |
| profitEstimate | salesRevenueCfa − fullCost (en attendant F8) |
| quotaUsedPct | girthM3 ÷ quotaM3 (consommation du quota sur cubage parc) |

Vérifications Excel (déjà validées au chiffre) : transport 15 × 475 000 = 7 125 000 ✓ ; Ibrahim 12 017 672 ✓ ; SODEFOR 42,5+7,5+2,5 = 52,5M ✓ ; full cost 71 642 672 ✓.

## 3. Suggestions de dûs — `GET /contracts/:id/account-suggestions`

Pour chaque tiers assigné au contrat, comparer **attendu** vs **Σ DUE existants** ; proposer le delta :

| Tiers | Dû attendu |
|---|---|
| transportParty | trucksEntered × transportPrice |
| cubageParty (Ibrahim) | girthM3 × ibrahimPrice |
| sodeforParty | feeSodeforR + feeSodeforPlus + feeReforestation |

Réponse : `[{ party, expected, existingDue, delta, label }]` (delta ≠ 0 seulement).
UI compta : bouton « Ajouter » par suggestion → crée l'écriture DUE (description auto, ex « Transport 15 camions × 475 000 »). Rien d'automatique en base sans clic.

---

## 4. API — delta

```
MODIFIÉ  POST /production-runs           + truckIds?: string[]
NOUVEAU  GET  /contracts/:id/summary
NOUVEAU  GET  /contracts/:id/account-suggestions
NOUVEAU  CRUD /sales   (POST bulk lines, GET ?contractId=, GET /:id, DELETE /:id)
MODIFIÉ  /contracts    (schémas allégés — champs dérivés retirés)
SUPPRIMÉ recompute (derive.ts) + hooks dans trucks/production
```

Conservés tels quels : /trucks, /measurements, /production-runs (reste), /parties, /account-entries, /contracts/:id/accounts, /contracts/:id/cutting.

---

## 5. Écrans cibles

### Navigation (layout refondu)

Desktop : sidebar. Mobile : barre d'onglets bas d'écran (terrain = mobile first).

```
▣ Tableau de bord   KPI globaux tous contrats
▣ Contrats          liste → fiche pipeline
▣ Réception         camions récents + nouveau camion + étalage   (rôle Parc)
▣ Débitage          sessions récentes + nouvelle session          (rôle Scierie)
▣ Stock             parc grumes + produits par taille             (lecture)
▣ Ventes            ventes + nouvelle vente                       (rôle Export)
▣ Comptabilité      comptes par contrat + suggestions + paiement  (rôle Bureau)
```

Chaque page étape : sélecteur de contrat en tête (contrats OPEN d'abord), puis saisie/liste. Les composants existants (TallyEntry, SawnEntry, AccountsSection…) sont réutilisés.

### Fiche contrat = pipeline

```
[ A3-2026-029 · Ouvert · 2026 ]
Réception   ▓▓▓░░  15/47 camions · 304.9 m³ girth · quota 30 %
Débitage    ▓▓░░░  12 sciés · 3 sur parc · 168.2 m³ (55.2 %)
Stock       142.1 m³ produits · 45.3 m³ parc
Ventes      96.8 m³ vendus · 33 456 000 FCFA
Compta      full cost 71.6M · payé 50M · solde 21.6M
─ puis sections détaillées (cutting, comptes, camions, sessions…)
```

### Formulaire contrat réduit

Général (code, année, statut, note) · Termes (quota, camions prévus) · Prix (9 champs) · Frais SODEFOR (3) · Budgets (4) · Tiers assignés (3 selects).
**Disparaissent** : entrés, non-sciés, # pieds, débité, rendement, coûts Ibrahim/transport/autre.

### Nouvelle vente (page Ventes)

Contrat → tableau stock dispo par taille (calculé) → lignes : taille (select stock), m³ (⚠ si > dispo), prix USD (prérempli contrat) ou CFA direct (prérempli 1"), taux (prérempli) → montant CFA live → valider.

### Tableau de bord (v1)

Cartes par contrat OPEN (pipeline mini) + totaux : stock produits global, stock parc, ventes du mois, soldes tiers rouges. Camemberts tailles = plus tard (Recharts, phase suivante).

---

## 6. Ordre d'exécution

1. **Prisma** : Contract diet (drop/rename + 3 party FK), `ProductionRunTruck`, `Sale`/`SaleLine`. Migration (données test → reset OK).
2. **Shared** : schémas Zod + DTOs (`ContractSummaryDTO`, `SaleCreateInput`, `AccountSuggestionDTO`…), retrait des champs morts.
3. **API** : summary, suggestions, sales ; production + truckIds ; contracts allégé ; drop derive.ts.
4. **Web lib** : client API.
5. **Layout** : sidebar/tabs + routes.
6. **Pages** : Dashboard, Réception, Débitage, Stock, Ventes, Compta ; fiche contrat pipeline ; formulaire réduit.
7. **E2E complet** : contrat → 2 camions + étalages → débitage lié camion 1 → vérif dérivés (entrés 2, scié 1, non-scié 1, rendement, stock) → vente → stock baisse + CA → suggestions dûs → ajout → full cost = Σ dûs → solde.
8. **Docs** : PLAN.md / FORMULAS.md mis à jour.

## 7. Décisions figées / notes

- Budgets et expectedProfit restent **saisis** tant que F8 (formule Excel) inconnue.
- `exportSizesCost` retiré du modèle (revient en dérivé quand la définition sera claire).
- Étalage brousse (FIELD) optionnel par camion ; le girth parc reste la référence rendement/quota.
- Vente 1" : prix CFA direct (140 000/m³) ; export : USD × taux. XOR validé.
- Pas de StockMovement journalisé v1 : stock 100 % dérivé (volumes faibles). Journal si besoin d'audit plus tard.
- Auth/rôles, conteneurs+photos, exports PDF/Excel, camemberts : **après** la refonte.
