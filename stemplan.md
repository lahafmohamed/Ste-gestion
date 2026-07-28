# STEMPLAN — Audit complet & plan de la vision STE

> Date : 2026-07-17 · Remplace la lecture de [PLAN.md](docs/PLAN.md) / [REFONTE.md](docs/REFONTE.md) comme feuille de route active.
> Sources : audit du code (apps/api, apps/web, packages/shared), analyse des 4 `.xlsx`, des dumps PDF (pdf1–pdf7), du bordereau SODEFOR scanné (pdf2.pdf) et de `rapportactivité.txt`.

---

## 1. Résumé exécutif

**Constat n°1 — l'application existe déjà et est complète.** Contrairement à l'impression « il n'y a rien », le monorepo contient une application fonctionnelle : 11 migrations Prisma appliquées, tous les modules livrés (Contrats, Réception + étalage 3 cubages, Débitage, Stock dérivé, Ventes, Empotage/Conteneurs, Compta, Rapport quotidien, Dashboard), auth JWT + 5 rôles, exports Excel, typecheck vert. **Le « rien » vient du fait que le site n'a jamais été lancé/déployé et que la base est vide** (aucun seed, aucune donnée).

**Constat n°2 — la vision exprimée est déjà couverte à ~70 %.** Créer plusieurs contrats en parallèle : supporté. Suivi de l'utilisation du contrat relié aux réceptions camions : déjà calculé (`quotaUsedPct = girth m³ ÷ quota` dans `GET /contracts/:id/summary`). Réception avec cubage, bordereau, diamètre, circonférence : supporté (3 relevés par camion : brousse / girth / diamètre).

**Constat n°3 — les vrais écarts sont ailleurs** :
1. L'app n'est pas en service (lancement, données, déploiement) — c'est le blocage principal.
2. La **packing list grumes** (« Spécification de transport » SODEFOR : bille par bille, Ø gros bout / petit bout / moyen, longueur, volume) n'est pas modélisée — la réception ne stocke que le total brousse déclaré.
3. Le **bordereau SODEFOR** réel contient bien plus de champs que le modèle `Truck` (transporteur, chauffeur, remorque, N° carnet, N° BON, forêt classée, heure de départ…).
4. Le **contrat** réel a des champs administratifs absents (date de signature, durée 11 mois, date de mise en exploitation, forêt, centre de gestion) — nécessaires pour la « saisie progressive ».
5. Navigation : la vision demande un **bouton Contrat dans le header** ; l'app actuelle a une sidebar 9 entrées.

Le plan (§6) : Phase 0 mettre l'app en service, Phases 1–2 aligner Contrats + Réception sur la vision et le terrain, Phase 3 améliorer sciage/stock/vente/export, Phase 4 durcir et déployer.

---

## 2. Audit — état du code

### 2.1 Stack

| Couche | Réalité |
|---|---|
| Monorepo | pnpm workspaces — `@ste/api`, `@ste/web`, `@ste/shared` |
| API | Fastify 5 + @fastify/jwt + zod + exceljs (exports xlsx) — port 3001 |
| ORM/DB | Prisma 6 + PostgreSQL, 11 migrations, `Decimal` partout (jamais float) |
| Web | Vite 6 + React 18 + React Router 7 + TanStack Query 5 + Tailwind 3 — port 5173 |
| Shared | `packages/shared/src/index.ts` (709 l.) : Zod + DTOs + calculs F1–F9 (`volumeGirthM3`, `volumeDiameterM3`, `sawnVolumeM3`, `classifySize`…) + constantes (`GIRTH_SPLIT_CM=85`, `LONG_SPLIT_FT=6.5`, `M3_TO_CFT=35.3`) |

### 2.2 Modules livrés (aucun module vide)

| Module | État | Où |
|---|---|---|
| Dashboard | cartes par contrat (quota, débité, stock, CA, solde) | `/` DashboardPage |
| Contrats | CRUD complet, fiche pipeline, summary dérivé | `/contracts`, `/contracts/:id` |
| Réception | camions + étalage 3 cubages, calcul auto F1/F2 | `/reception`, `/trucks/:id` |
| Débitage | sessions N-N camions, avivés/taille, rendement F6 | `/debitage`, `/production-runs/:id` |
| Stock | parc grumes + produits par taille (100 % dérivé) | `/stock` |
| Ventes | USD×taux ou CFA direct, déduction stock | `/ventes` |
| Empotage | conteneurs, plomb/faux plomb, booking, destination, statuts | `/empotage` |
| Compta | dûs/paiements par tiers + suggestions auto de dûs | `/compta` |
| Rapport | rapport d'activité quotidien généré (texte copiable) | `/rapport` |
| Utilisateurs | CRUD (ADMIN) | `/utilisateurs` |

Principes en place (issus de REFONTE, vérifiés E2E au chiffre) : **saisie unique à la source, tout agrégat dérivé live** par `/contracts/:id/summary` — rien n'est retapé.

### 2.3 Dettes constatées

- **README obsolète** (dit « scaffold uniquement, aucun modèle » — faux) → confusion sur l'état réel du projet.
- **Aucun seed** de données → app vide au premier lancement → impression « il n'y a rien ».
- **Aucun test** automatisé.
- Sécurité : admin par défaut `admin@local/admin123`, `cors origin: true`, pas de vérif d'expiration du token côté front.
- `@ste/shared` monolithique (709 lignes, 1 fichier).
- Incohérence documentée F11 : facteur CFT 35.3 (cubage) vs 35.315 (débité) — conservé pour matcher l'historique Excel.

---

## 3. Audit — documents métier (Excel + PDF)

### 3.1 Le workflow réel observé (1 camion suivi de bout en bout)

Camion type `3201 GS 01`, BL `176530`, contrat `A3-2026-014`, parcelle `146-99/04`, forêt `SANGOUÉ` :

```
1. ENTRÉE (réception)      bordereau SODEFOR → 58 billes, CUBAGE BROUSSE 33,171 m³
2. ÉTALAGE (recubage parc) 60 billes réellement sur parc (écart assumé vs 58)
                           VOL-DIA 27,294 m³ (contrôle) · VOL-G 28,865 m³ (référence)
                           split VOL-G ≥85 cm = 17,703 / <85 = 11,162
3. DÉBITÉ (sciage)         15,926 m³ · 1369 pièces · rendement 55,17 % (= débité ÷ VOL-G)
                           splits LONG ≥6,5ft (82 %) / SHORT · bandes d'épaisseur
4. EMPOTAGE (conteneur)    TC MRKU 684202/0 · plomb ML-CI 1238871 · faux plomb STE 0523
                           booking 270377830 · MANGALORE · 1101 pièces · 24,517 m³
```

**Confirmation de la « saisie progressive »** : chaque étape ajoute ses données à des moments différents. À la réception on ne connaît que le bordereau + cubage brousse ; le girth vient à l'étalage ; le rendement au sciage. Idem au niveau contrat : numéro + quota m³ connus dès la signature, le reste (camions, cubages, coûts) se remplit avec le temps. **Le modèle actuel supporte déjà ça** (presque tous les champs optionnels ou à défaut 0).

### 3.2 Le bordereau SODEFOR réel (pdf2.pdf p.1 — « Circulation des bois en grumes »)

Champs observés non modélisés dans `Truck` :

| Champ | Exemple réel |
|---|---|
| Transporteur | JAMAL |
| Chauffeur | KONATE MADOU |
| Remorque | 7794 F3 01 |
| Date de chargement / heure de départ | 11/05/2026 · 15H |
| N° carnet / Réf. bordereau | 6455 · `6455-0176530-YAA/BS-C4` |
| N° BON | 225640693814 |
| Code vérification SMS | 47734027 |
| Forêt classée / Centre de gestion / Origine | SANGOUÉ · GAGNOA · OUMÉ |
| Destination (parc usine) | TOUMODI |
| Agent de suivi | Sgt Koffi Joel |

⚠️ Point structurant relevé dans les grands livres Excel (pdf1/pdf7) : **la clé pivot du suivi par camion est le n° de bordereau/BON** (`# BRDX`), pas l'immatriculation (un camion physique revient plusieurs fois). Le modèle a déjà `deliveryNote` — à rendre central.

### 3.3 La packing list grumes (pdf2.pdf p.2 — « Spécification de transport »)

Le document officiel détaille **1 ligne par bille** (58 lignes) :

| N° Bille | Ø gros bout (cm) | Ø petit bout (cm) | Ø moyen (cm) | Longueur (ex 1120 = 11,20 m) | Volume (×10⁻³ m³) |
|---|---|---|---|---|---|
| 1509 | 34 | 16 | 25 | 1120 | 550 |

Pied de page : report cubage carnet (3 773,020 m³ cumulé) + total camion (33,171 m³). **C'est la source officielle du cubage brousse** — aujourd'hui l'app ne stocke que le total (`declaredFieldM3`), pas le détail bille par bille.

### 3.4 Traçabilité bille → billon (Excel DIAMETRE + GIRTH)

- DIAMETRE : 60 billes, `N° BILL` 266→325 (**numérotation continue inter-camions**).
- GIRTH : 275 billons, `Num logs` = n° bille + suffixe (`283A`, `283B`…) — **une bille est tronçonnée en plusieurs billons** avant sciage.
- Le champ `Log.externalId` porte ces numéros ; le lien bille↔billon est déduit du suffixe (`billParent`, `@ste/shared`).

✅ **Chronologie confirmée terrain (2026-07-23)** : l'étalage mesure les **billes** (Ø). Ensuite **la bille n'est jamais remesurée** — on nettoie le bois puis on le tronçonne, et la bille 266 devient les billons 266A, 266B, 266C… **dont chacun reçoit sa propre nouvelle mesure** (L + circonférence = girth). Conséquence directe : **un relevé girth compte des billons, pas des billes** — comparer ses 275 lignes aux 58 billes du bordereau n'a aucun sens. Tout comptage de billes passe par `truckBillCount` / `billCount` (regroupement par bille mère).

⚠️ Discordance d'unités F1 (cubage diamètre) : FORMULAS.md dit longueur en **pieds** + diamètre en **pouces** ; la lecture des cellules suggère **mètres + cm** (la constante 0.00007854 = π/4×10⁻⁴ donne le même chiffre dans les deux lectures, ex. 13 × 26² × 0.00007854 = 0,690 m³). Le résultat numérique est identique — mais **l'étiquette d'unité affichée à l'écran doit être tranchée avec le terrain** (26 = pouces ou cm ?).

### 3.5 Suivi de quota contrat (workbook pdf1/pdf7)

L'Excel de pilotage tient, par contrat (plusieurs contrats en parallèle confirmés — A3-2026-014 et A3-2026-029 coexistent) :
`M3 (quota 1000) · # Pieds · TOTAL TRUCKS ENTERED · REMAINING · ON PARC UNCUT · TOTAL UNCUT`
— exactement ce que `/contracts/:id/summary` calcule déjà (trucksEntered, trucksRemaining, stockParc, quotaUsedPct).

Champs contrat observés sur le bordereau et absents du modèle : **date de signature (03/02/2026), durée (11 mois), date de mise en exploitation (05/05/2026)**, forêt classée, centre de gestion, société attributaire / marteau forestier.

Les valeurs (brousse, parc, débité) sont **recopiées à la main entre classeurs** — source d'erreurs majeure que l'app élimine par construction (saisie unique, agrégats dérivés).

---

## 4. La vision STE (reformulée) et l'écart avec l'existant

| # | Vision exprimée | État actuel | Écart |
|---|---|---|---|
| V1 | Dashboard STE (aujourd'hui vide) | DashboardPage existe, cartes par contrat | App jamais lancée + base vide + pas de branding STE. **Écart = mise en service, pas développement** |
| V2 | Bouton **Contrat** dans le header | Sidebar 9 entrées (desktop) / tabs (mobile) | Refonte navigation : header avec bouton Contrat proéminent |
| V3 | Créer un contrat ; **plusieurs contrats en même temps** | CRUD contrats + sélecteur de contrat sur chaque page ; multi-OPEN supporté | Aucun (déjà couvert) — à valider à l'usage |
| V4 | **Saisie progressive** : n° contrat + m³ dès le début, le reste vient avec le temps | Quasi tous champs optionnels/défaut 0 ; formulaire = 1 gros bloc (219 l.) | Formulaire à découper : création minimale (code + quota), le reste en sections éditables plus tard + champs admin manquants (dates, durée, forêt) |
| V5 | **Suivi d'utilisation du contrat relié aux réceptions** : chaque camion reçu dit combien de m³, on sait combien du contrat est consommé | `quotaUsedPct = girthM3 ÷ quotaM3` déjà dérivé dans summary + fiche pipeline | Visibilité : mettre la jauge quota au centre de la fiche contrat et du dashboard ; décider quelle mesure consomme le quota (brousse ou girth — aujourd'hui girth) |
| V6 | Réception camion : **cubage, bordereau, packing list, diamètre, circonférence** | Truck + 3 relevés (FIELD/GIRTH/DIAMETER), volumes auto F1/F2 | **Packing list grumes bille par bille (Ø 3 bouts) absente** ; champs bordereau SODEFOR incomplets (§3.2) |
| V7 | Ensuite : améliorer sciage, stock, vente, export | Modules complets mais jamais éprouvés en usage réel | Améliorations ciblées (§6 Phase 3) après retours d'usage |

---

## 5. Décisions à trancher (bloquantes pour les phases 1–2)

1. ~~**Quota consommé = quel cubage ?**~~ ✅ **TRANCHÉ 2026-07-17 : BROUSSE** (mesuré bille par bille, sortie forêt = ce que SODEFOR décompte). Le girth ne sert plus qu'au rendement. `quotaUsedPct = Σ brousse ÷ quota` (brousse = étalage FIELD > packing list > déclaré). Voir [FORMULAS.md](FORMULAS.md).
2. **Unité affichée du cubage diamètre** (§3.4) : pouces ou cm ? Le calcul ne change pas, l'étiquette si.
3. **Packing list grumes** : saisir les 58 lignes du bordereau (Ø gros/petit/moyen bout) dans l'app, ou seulement le total brousse + photo/scan du document ? (Proposition : total + nb billes obligatoires, détail lignes optionnel, upload scan plus tard.)
4. **Header** : bouton Contrat unique (vision) en plus ou à la place de la sidebar ? Proposition : header permanent avec logo STE + bouton Contrats + sélecteur de contrat actif ; la sidebar reste pour les étapes métier.
5. Déploiement cible : local (un poste au bureau) ou en ligne (Railway/Neon/Supabase) ? Conditionne Phase 0 et 4.

---

## 6. Plan d'exécution

### Phase 0 — Mise en service ✅ (faite le 2026-07-17)

| # | Tâche | Détail |
|---|---|---|
| 0.1 | Lancer l'app en local | Postgres + `.env` + migrations + `pnpm dev` ; vérifier login admin |
| 0.2 | **Seed de démonstration** | Script `prisma/seed.ts` rejouant le camion réel des Excel : contrat A3-2026-014, camion 3201 GS 01 (BL 176530), étalages dia (60 billes) + girth (275 billons), débitage 15,926 m³, empotage MRKU 684202/0 — le dashboard montre immédiatement des vrais chiffres vérifiables |
| 0.3 | README à jour | Refléter l'état réel (app complète), procédure de lancement |
| 0.4 | Changer identifiants admin par défaut | Avant toute mise en ligne |

### Phase 1 — Contrats selon la vision (V2–V5) ✅ (faite le 2026-07-17)

> Décisions appliquées (§5) : header **en plus** de la sidebar. Migration `contract_admin_fields` (12ᵉ). ⚠️ Quota d'abord basé girth, **corrigé le 2026-07-17 → BROUSSE** (cf. §5.1 + FORMULAS.md).

| # | Tâche | Détail |
|---|---|---|
| 1.1 | **Header STE** | Bandeau permanent : logo/nom STE + bouton **Contrats** + contrat actif visible partout |
| 1.2 | **Création minimale de contrat** | Formulaire de création réduit à l'essentiel connu au départ : code (ex `A3-2026-014`) + quota m³ (+ année). Tout le reste éditable après |
| 1.3 | **Fiche contrat en sections progressives** | Découper le formulaire 219 l. en cartes indépendantes : Termes · Administratif (nouveau) · Prix · Frais SODEFOR · Budgets · Tiers — chaque carte s'édite séparément, indicateur de complétude |
| 1.4 | Champs administratifs contrat (migration) | `signedAt`, `durationMonths` (11 mois), `exploitationStartAt`, `forest` (SANGOUÉ), `managementCenter` (GAGNOA) — d'après le bordereau réel |
| 1.5 | **Jauge d'utilisation du quota** | Au cœur de la fiche + du dashboard : m³ reçus (girth) ÷ quota, avec brousse en regard, camions entrés/prévus/restants — alimentée automatiquement par chaque réception (déjà dérivé, à mettre en avant) |
| 1.6 | Liste contrats multi-actifs | Tri OPEN d'abord, badge d'avancement quota par carte — travail parallèle sur plusieurs contrats confirmé |

### Phase 2 — Réception camion niveau terrain (V6) ✅ (faite le 2026-07-17)

> Migration `truck_bordereau_packing` (13ᵉ). Décisions : packing list = **total obligatoire (brousse déclaré), détail bille optionnel** ; unité cubage diamètre = **métrique (m + cm)** — tranché par l'arithmétique Excel, à confirmer terrain. Écart 58/60 billes remonté automatiquement du seed.

| # | Tâche | Détail |
|---|---|---|
| 2.1 | Champs bordereau SODEFOR (migration `Truck`) | transporteur, chauffeur, remorque, `loadedAt`/heure départ, n° carnet, n° BON, code SMS, agent de suivi, destination — tous **optionnels** (saisie progressive) ; `deliveryNote` mis en avant comme clé pivot |
| 2.2 | **Packing list grumes** | Nouveau relevé (contexte FIELD enrichi ou table dédiée) : 1 ligne par bille — n° bille, Ø gros bout, Ø petit bout, Ø moyen, longueur, volume ; total auto comparé au `declaredFieldM3` ; selon décision §5.3 |
| 2.3 | Écarts de comptage | Afficher billes bordereau (58) vs billes sur parc (60) — écart assumé, visible, non bloquant |
| 2.4 | Traçabilité bille → billon ✅ (2026-07-23) | `Log.externalId` exploité de bout en bout : réception en 3 étapes (arrivée → **étalage billes** Ø → **billonnage** girth), sélecteur de bille qui numérote les billons (266 → 266A, 266B, 266C…), regroupement par bille mère, comptages billes vs billons corrigés (cartes camions, fiche camion, rapport quotidien, export Excel) |
| 2.9 | Robustesse contrat & réception ✅ (2026-07-24) | (a) confirmations avant toute suppression (contrat, camion, relevé, session, conteneur, vente, écriture) ; (b) **brouillon localStorage** de la saisie étalage/billonnage (clé `truckId:context`, restauré après interruption, purgé au save — bannière « Repartir à zéro ») ; (c) `arrivedAt` saisissable (réception + bordereau, midi local anti-décalage TZ) ; (d) **verrou contrat CLOSED** côté API (`contract-lock.ts`, 409 sur créations trucks/étalages/packing/sciage/ventes/conteneurs/écritures) + bandeau lecture seule ; (e) warn B/L doublon non bloquant à la réception ; (f) préremplissage étalage Ø depuis les n° de la packing list ; (g) chip « perte brousse → parc » (amber si >25 %) ; (h) filtres cartes camions (À étaler / À billonner / Billonnés) |
| 2.8 | Estimation camions ✅ (2026-07-24) | Projection auto : moyenne brousse des camions arrivés → `estTrucksRemaining` / `estTrucksTotal` (`summary`). Jauge quota : « ≈ N camions encore nécessaires (≈ T au total) — moyenne X m³/camion » ; cartes contrats & dashboard affichent le total estimé (à défaut le `trucksPlanned` saisi, conservé comme chiffre contractuel) |
| 2.7 | Vocabulaire unifié « bille / billon » ✅ (2026-07-23) | Un seul lexique sur toute l'app — **brousse → billes (Ø) → billons (girth) → débité**. Fiche contrat : bandeau *chaîne de mesure* en 4 étapes (cubage + nb billes/billons), « Billons ≥85 cm », « Stock parc (billons) ». Analyse par camion : colonnes `# Billes` / `# Billons` / `Billes m³` / `Billons m³` séparées. Débitage : *billons sciés* groupés par bille mère (clic sur la bille = tous ses billons), rendement « débité ÷ billons ». Stock : billons non sciés par camion. DTO : `logCount` → `billeCount` + `billonCount` (`summary`, `truck-stats`) |
| 2.5 | Ergonomie saisie étalage mobile | Gros boutons, `inputmode="decimal"`, total + moyenne live, validation par lot (déjà partiellement en place — durcir sur téléphone réel) |
| 2.6 | Trancher l'étiquette d'unité F1 | Selon décision §5.2, corriger libellés UI + FORMULAS.md |

### Phase 3 — Améliorations sciage / stock / vente / export (V7) ✅ (faite le 2026-07-17)

> Migration `container_truck_link` (14ᵉ). Backend splits (truck-stats, daily-report) déjà présents → surfacés en UI. Packing list conteneur + rapport = impression navigateur → PDF (pas de dépendance ajoutée).

| # | Tâche | Détail |
|---|---|---|
| 3.1 | Débitage | Lien session↔camions plus visible ; rendement live pendant la saisie ; splits LONG/SHORT et bandes d'épaisseur affichés comme dans le rapport d'activité. **+ 2026-07-17 : sciage par billes** — sélection des billons girth sciés par session (table `production_run_log`, 15ᵉ migration) ; stock parc au niveau bille (girth restant = total − billes sciées ; session sans billes = camion entier, historique) ; rendement calculé sur les billes choisies |
| 3.2 | Stock | Vue parc par camion (girth ≥85/<85) ; alertes stock négatif |
| 3.3 | Ventes | Contrôle dispo par taille durci ; historique par client |
| 3.4 | Export/Empotage | Rapprochement conteneur ↔ camions d'origine (aujourd'hui non lié) ; packing list conteneur imprimable (PDF) au format du document réel |
| 3.5 | Rapport quotidien | Déjà généré — ajouter export PDF/partage |

### Phase 4 — Durcissement & mise en ligne

> 4.1 ✅ 4.2 ✅ 4.4 ✅ 4.5 ✅ (2026-07-17) : CORS env-driven, garde secret fort en prod, expiration token front ; vitest (17 tests + régression seed) + smoke E2E `/summary` ; `@ste/shared` découpé (`primitives`/`formulas`/`sizes` + barrel, index 817→700 l.) ; sources brutes rangées dans `docs/`. **Reste 4.3 (déploiement — décision §5.5 : local ou en ligne ?).**

| # | Tâche | Détail |
|---|---|---|
| 4.1 | Sécurité | CORS restreint, expiration token côté front, secrets hors repo |
| 4.2 | Tests | Au minimum : tests des formules F1–F6 (chiffres Excel comme oracle : 0.69021, 0.16428, 15.9257, 55.17 %) + un E2E summary |
| 4.3 | Déploiement | ⏸️ **différé (2026-07-17, choix utilisateur)** — reste en dev local `pnpm dev`. Reprendre au choix : local / Railway-Neon / Docker |
| 4.4 | Découpage `@ste/shared` | schemas / calculs / constantes en modules séparés |
| 4.5 | Nettoyage racine | Archiver pdf*.md, xlsx, PLAN/REFONTE dans `docs/` — stemplan.md devient la référence |

---

## 7. Ce que ce plan ne refait PAS

- **Pas de réécriture** : le socle (modèle Prisma, summary dérivé, formules validées au chiffre) est bon et vérifié E2E. On construit dessus.
- Pas de photos/storage R2, pas de PWA offline, pas de multi-essences : reportés (cf. questions ouvertes PLAN.md §12) tant que le flux de base n'est pas utilisé en réel.
- Les formules F1–F11 restent celles de [FORMULAS.md](FORMULAS.md) (source de vérité), seule l'étiquette d'unité F1 est à clarifier.
