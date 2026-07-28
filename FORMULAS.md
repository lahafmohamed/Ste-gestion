# Formules métier — source de vérité

> Extraites des cellules Excel (formules réelles, pas valeurs). Vérifiées au chiffre près.
> **Tous calculs critiques = backend.** Le front ne fait que prévisualiser.

---

## F1 — Cubage grume par DIAMÈTRE (vérification "VOL-DIA")

Fichier : `DIAMETRE TECK DU 12-05-2026.xlsx`

```
volume_m3 = length_m × dia_cm² × 0.00007854
cft       = volume_m3 × 35.3
```

- ⚠️ **Corrigé 2026-07-17** : `length` en **mètres**, `dia` en **cm** (pas pieds/pouces).
  La constante `0.00007854 = π/4 × 10⁻⁴` ne réconcilie les chiffres Excel **que** sous
  cette lecture métrique — cohérent avec F2 (girth parc aussi en m + cm). L'étalage parc
  (diamètre & girth) est métrique ; seul le **débité** scierie (F3) est en pieds/pouces.
- Vérif log#1 : 13 × 26² × 0.00007854 = **0.69021 m³** ✅ ; CFT = 24.3644 ✅
- Total camion = Σ volumes (= "VOL-DIA").
- ⚠️ Dette : les colonnes DB `log.length_ft` / `log.diameter_in` gardent leurs noms
  historiques mais **contiennent des valeurs m / cm** ; renommage à planifier.

---

## F2 — Cubage grume par CIRCONFÉRENCE / GIRTH (= "CUBAGE PARC")

Fichier : `GIRTH TECK DU 12-05-2026.xlsx`

```
volume_m3 = length_m × circ_cm² / 160000
```

- `length` en **mètres**, `circ` (circonférence) en **centimètres**.
- ⚠️ **Unités différentes de F1** (m + cm, pas ft + in).
- Vérif log#1 : 1.2 × 148² / 160000 = **0.16428 m³** ✅
- Total = Σ (= "VOL-G", ex 28.865 m³). **C'est le cubage parc de référence.**

---

## F3 — Volume DÉBITÉ (avivé) + EMPOTAGE

Fichiers : `DEBITES TECK ...xlsx`, `EMPOTAGES DEBITES ...xlsx` (même formule)

```
volume_m3 = (length_ft × width_in × thickness_in / 144 / 35.315) × count
```

- `length` en **pieds**, `width`/`thickness` en **pouces**, `count` = nbr de pièces (NBR DE LIGNE).
- `/144` : in²→ft² ; `/35.315` : ft³→m³.
- Vérif débité log#1 : 9 × 9 × 8 / 144 / 35.315 × 1 = **0.127425 m³** ✅
- Total session = Σ (ex 15.9257 m³, 1369 pièces).

---

## F6 — Rendement parc

```
rendement_parc = volume_debite_total / cubage_parc_total
```

- Vérif : 15.9257 / 28.865 = **0.5517 (55.17 %)** ✅
- Dénominateur = **cubage parc (F2/girth)**, pas le diamètre.

---

## Quota SODEFOR — consommé au cubage BROUSSE (corrigé 2026-07-17)

```
quota_used_pct = Σ brousse_par_camion / quota_m3 × 100
brousse_par_camion = étalage FIELD saisi (1 par 1)  OU  packing list grumes  OU  brousse déclarée
```

- ⚠️ **Renversement de la règle initiale** (qui utilisait le girth parc). Le quota est un
  droit d'exploitation SODEFOR : il se décompte sur ce qui **sort de la forêt**, soit le
  **cubage brousse** mesuré bille par bille à l'état brut (spécification de transport).
- Le **girth parc** ne sert plus qu'au **rendement (F6)**, pas au quota.
- `brousseM3` (endpoint `/summary`) prend, par camion, la meilleure source dispo :
  étalage brousse > packing list > total déclaré.

---

## F11 — Conversion volume ↔ CFT

```
cft = volume_m3 × 35.3      (feuille diamètre)
m3  = ft3 / 35.315          (feuille débité)
```

⚠️ Incohérence mineure source : **35.3** (cubage) vs **35.315** (débité). À uniformiser → recommander **35.3147** partout, OU conserver à l'identique pour matcher l'historique (à trancher).

---

## Les 3 cubages d'un camion (réconciliation)

| Mesure | Source | Unité comptée | Ex (camion 3201) | Usage |
|--------|--------|---------------|------------------|-------|
| **Cubage brousse** | saisi forêt (manuel) | billes | 33.171 m³ · 58 billes | référence achat |
| **Cubage billes (diamètre)** | F1, à l'étalage | **billes** (266→325) | 27.294 m³ · 60 billes | comptage parc, contrôle |
| **Cubage billons (girth)** | F2, après tronçonnage | **billons** (266A, 266B…) | 28.865 m³ · 275 billons | **rendement** |

→ Modèle : un camion peut porter **plusieurs jeux de mesures** (FIELD / YARD_GIRTH / YARD_DIAMETER).

⚠️ **Étalage puis billonnage — la bille n'est pas remesurée.** L'étalage mesure les billes
(L + Ø). Ensuite on nettoie le bois et on le tronçonne : la bille 266 devient les billons
266A, 266B, 266C…, **et c'est chaque billon qui reçoit une nouvelle mesure** (L + circonférence).
Un relevé girth compte donc des **billons** — 275 billons ⇔ 60 billes. Ne jamais comparer son
nombre de lignes au comptage du bordereau : regrouper d'abord par bille mère
(`billParent` / `billCount` / `truckBillCount` dans `@ste/shared`).
Le volume monte de 27.294 → 28.865 m³ parce que chaque billon est cubé sur sa propre section.

---

## Empotage conteneur (observé)

Fichier : `EMPOTAGES DEBITES DU 08-05-2026.xlsx`

- Conteneur : `MRKU 684202-0`, grade **5X3 B GRADE**.
- Plomb (seal) : `N°PLOMB = ML-CI 1238871`.
- Lignes avivés (même F3) → **volume total** (24.517 m³) + **nbre éléments** (1101 pièces).
- Observé : 1 conteneur = 1 grade/taille ici (à confirmer si toujours le cas → Q multi-taille).

---

## F4 / F5 — Classement des tailles ✅ (résolu, dashboard A3-2026-029)

Bloc **CONTRACTS CUTTING**. Trois groupes :

| Groupe | Code | Tailles | m³ (ex 141-3/06) |
|--------|------|---------|------------------|
| **Main sizes** | `MAIN` | 7"+, 6x4, 6x3, 5x4, 5x3 | 68.531 |
| **Side sizes** | `SIDE` | 4", 2", 1.5" | 48.970 |
| **1"** (à part) | `ONE_INCH` | 1" | 24.606 |
| **Total** | | | 142.107 |

Vérif : 68.531 + 48.970 + 24.606 = **142.107** ✅

**Règle mécanique implémentée** (`classifySize`, inférée — à valider) :
1. ép = 1 → `1"` (ONE_INCH) ; ép = 1.5 ou 2 → SIDE
2. couple l×ép ∈ {6x4, 6x3, 5x4, 5x3} → MAIN ; {4x3} → SIDE
3. l ≥ 7 → `7"+` (MAIN)
4. sinon → AUTRE

**F6 auto** (refonte 2026-07-13) : `debitedM3`, `outputPct`, camions entrés/sciés/non-sciés, **stock parc** (= girth des camions non liés à une session), **stock produits** (= débité − vendu par taille) et **full cost** (= Σ dûs tiers, plus saisi) sont tous calculés live par `GET /contracts/:id/summary`. Camion « scié » = lié à ≥1 `ProductionRun` (table `production_run_truck`).

**Suggestions de dûs** (`GET /contracts/:id/account-suggestions`) : transport = camions entrés × transportPrice ; cubage = girth m³ × ibrahimPrice ; SODEFOR = feeSodeforR + feeSodeforPlus + feeReforestation. Delta vs dûs existants, ajout sur clic.

---

## Splits métier (rapport d'activité + Daily Truck Log — 2026-07-13)

Constantes (shared) :
- **GIRTH_SPLIT_CM = 85** : billes girth ≥85 cm vs <85 cm de circonférence (« VOL G ≥85 / <85 » du rapport).
- **LONG_SPLIT_FT = 6.5** : avivés LONG (≥6,5 ft) vs SHORT (« Long 6,5 feet+ / 6 feet− », colonnes LONG/SHORT du dashboard).
- **Bandes d'épaisseur** : ép ≥3" ; 1,5–3" ; <1,5" (1,25–1").
- **1" %** = volume 1" ÷ débité total.

Endpoints dérivés :
- `GET /contracts/:id/truck-stats` — analyse **par camion** (miroir Daily Truck Log pdf7) : billes, brousse/girth(≥85/<85)/dia, débité attribué (session ÷ nb camions liés), rendement.
- `GET /contracts/:id/daily-report?date=` — **rapport d'activité** généré (entrées, étalages avec split 85, débité avec LONG/SHORT + bandes ép, empotages) — remplace le rapport tapé main (rapportactivité.txt).

Conteneur : + `fauxSealNo` (faux plomb), `destination` (ex MANGALORE).

---

## F7 — Unités des prix ✅ (partiel, dashboard A3-2026-029)

Params : SODEFOR 55 000 · IBRAHIM 24 000 · TRANSPORT 475 000 · CUBAGE 100 000 · COMPANY 90 000 · EXPORT 65 000 · SELLING 570 · 1" 140 000.

- **Transport = par camion** : 475 000 × 15 (entrés) = **7 125 000** ✅
- **Ibrahim = par m³ cubage** : 24 000 × 304.903 = **7 317 672** ✅ (+ sous-cubage 4 700 000 = 12 017 672)
- SODEFOR / company / export / 1" : unité à confirmer (probablement par m³).

---

## F8 — Full cost + budgets ✅ (résolu, dashboard A3-2026-029)

```
full_cost = costSodeforR + costSodeforPlus + costReforestation
          + costIbrahim + costTransport + costOther
```

Vérif : 42 500 000 + 7 500 000 + 2 500 000 + 12 017 672 + 7 125 000 + 0 = **71 642 672** ✅

Budgets stockés : Wood 33 812 722 · Company 12 717 450 · Export 9 184 825.
**Profit attendu** : formule encore inconnue (⚠️ cellule en erreur dans l'Excel) → à stocker manuellement pour l'instant.

---

## F9 — Taux USD ✅ (résolu)

- `SELLING PRICE` = **570**, `USD CFA RATE` = **575** → deux taux (achat 570 / vente 575).

---

## Comptes tiers (observé — dashboard A3-2026-029)

- **Ibrahim** (compte « 067 ») : cubage 304.903 m³ → 7 317 672 + sous-cubage 4 700 000 = **devoir 12 017 672**, payé 20 000 000 → **solde −7 982 328**.
- Bloc **Payments** (SODEFOR) : PCA DG, DCM, Mahi, Sodefor Contrat, Reboissement…

> Table **par camion** (15 lignes = ENTERED) : #Pieds, CBM BDR/DIA/Circ (3 cubages), Debite, MS/1"/1.5", OUTPUT %, Cost. → module Réception/Production (phases 2-3).
</content>
