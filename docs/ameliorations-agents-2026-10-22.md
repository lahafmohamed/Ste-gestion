# Améliorations proposées (agents, 2026-10-22)

Produit par 8 agents : 1 backend, 5 UI taste, 2 chercheurs fonctionnels. Les changements appliqués sont dans le diff non commité ; ce fichier liste ce qui reste à décider ou à faire.

## Idées fonctionnelles · chaine-production

### 1. Le rapport d'activité ne montre plus les empotages ni les sessions de débitage multi-contrats

- **Priorité** haute · **type** bug · **effort** S
- **Pages** apps/api/src/routes/reports.ts, apps/web/src/pages/RapportPage.tsx
- **Constat** Le rapport journalier filtre `prisma.productionRun.findMany({ where: { contractId, producedAt } })` (reports.ts:214) et `prisma.container.findMany({ where: { contractId, loadedAt } })` (reports.ts:236). Depuis le passage au stock général, POST /containers n'écrit jamais de contractId (containers.ts:100-117), l'import CONTAINER non plus (imports/service.ts:502-511), et une session qui mélange deux contrats ou n'a aucun camion lié reçoit contractId = null (production.ts:141-142). Résultat : la section « empotages » du rapport est toujours vide pour les conteneurs récents, et une session de sciage du jour peut manquer à l'appel.
- **Proposition** Ajouter une variante tous contrats (GET /daily-report?date=) ou faire de la fiche contrat le seul filtre des arrivées et des étalages. Débitage : prendre les sessions dont au moins un camion lié appartient au contrat (`trucks: { some: { truck: { contractId } } }`), plus les sessions sans camion, signalées comme telles. Empotage : prendre tous les conteneurs chargés ce jour-là, sans filtre contrat (le stock est général). Dans RapportPage, ajouter le choix « Tous contrats ».
- **Gain** Le rapport papier remplace rapportactivité.txt. Aujourd'hui il dit « 0 conteneur chargé » un jour d'empotage : le chef de scierie ne peut pas s'y fier.

### 2. Un camion peut recevoir deux relevés Ø ou girth et le stock parc compte les deux

- **Priorité** haute · **type** bug · **effort** S
- **Pages** apps/api/src/routes/trucks.ts, apps/api/src/stock.ts, apps/web/src/lib/trucks.ts, apps/web/src/components/EtalageSection.tsx
- **Constat** POST /trucks/:id/measurements (trucks.ts:142-185) crée toujours un nouveau LogMeasurement, sans vérifier qu'il en existe déjà un pour ce contexte. L'import le refuse (imports/service.ts:243-248), la saisie live non. Deux tablettes, un double tap ou un retry après timeout donnent deux relevés girth. L'interface ne lit que le premier (`t.measurements.find(...)`, lib/trucks.ts:15 et :20 ; TruckDetailPage.tsx:126), alors que parcStock additionne toutes les lignes girth du camion (stock.ts:39-46, :82-95) et que la fiche contrat fait de même (summary.ts:261-279). Le second relevé est donc invisible mais compté dans le stock, le rendement et le split 85.
- **Proposition** Côté serveur, renvoyer 409 « Relevé déjà commencé, utiliser Continuer l'étalage » quand un relevé du même contexte existe sur le camion. Le client bascule alors sur POST /measurements/:id/logs, l'endpoint d'ajout qui existe déjà. Ajouter aussi un script de contrôle qui liste les camions ayant plus d'un relevé par contexte, pour nettoyer l'existant.
- **Gain** Le stock parc et le rendement ne sont plus gonflés en silence par une double saisie au parc, le cas limite le plus probable avec des tablettes sur un réseau instable.

### 3. Le stock produits en m³ ne déduit pas l'empoté, les pièces ne déduisent pas le vendu

- **Priorité** haute · **type** donnees · **effort** M
- **Pages** apps/api/src/stock.ts, apps/web/src/pages/StockPage.tsx, apps/api/src/routes/summary.ts
- **Constat** stockSummary calcule `stockProductsM3 = débité + rescié entrant − vendu − rescié sortant` (stock.ts:199-201) : les ContainerItem ne sont jamais déduits. sawnInventory fait l'inverse : il déduit l'empoté mais pas les ventes (stock.ts:213, :288). La page Stock affiche côte à côte « Stock produits » en m³ (qui ne baisse pas quand on empote) et « Pièces dispo » (qui ne baisse pas quand on vend) (StockPage.tsx:128-132). Après l'empotage d'un conteneur de 25 m³, le stock en m³ reste identique.
- **Proposition** Fixer une seule définition du stock physique : produit + rescié entrant − rescié sortant − empoté, en m³ comme en pièces, avec la même source pour les deux. Garder les ventes comme mouvement commercial. Ajouter deux indicateurs dérivés : « Empoté non vendu » (conteneurs chargés sans vente rapprochée) et « Vendu non empoté » (engagement à charger). Mettre FORMULAS.md (§F6, ligne 156) à jour avec la règle retenue.
- **Gain** Le stock affiché correspond enfin au bois présent sur le parc. On sait ce qui reste à empoter, sans recalculer à la main à partir des packing lists.

### 4. Session multi-contrats : les billons sciés restent au stock parc du contrat et le débité n'est attribué à personne

- **Priorité** haute · **type** bug · **effort** M
- **Pages** apps/api/src/routes/summary.ts, apps/api/src/routes/production.ts
- **Constat** Une session qui mélange deux contrats a contractId = null (production.ts:141-142). La fiche contrat ne charge que les liens `productionRunTruck/Log where run.contractId = contrat` (summary.ts:218-229, utilisés aux lignes 296-306) : les camions sciés dans cette session gardent leur girth dans le « stock parc » du contrat. Pourtant trucksSawn les compte comme sciés via `_count.productionRuns` (summary.ts:237-241). La vue d'ensemble ignore aussi le débité de ces sessions (summary.ts:105-106, `if (l.run.contractId)`). Le rendement du contrat est donc faux dès qu'on scie deux contrats ensemble, ce qui est fréquent puisque le Débitage n'impose plus de contrat.
- **Proposition** Pour le stock parc d'un contrat, prendre les liens de tous les runs dont le camion ou le billon appartient au contrat (`where: { truck: { contractId } }`), comme le fait déjà parcStock. Pour le débité et le rendement, répartir le volume d'une session multi-contrats au prorata du girth scié de chaque contrat (sawnGirthByTruck existe dans packages/shared), et l'afficher comme « débité réparti ».
- **Gain** Un rendement par contrat fiable sans interdire le sciage mixte. Le stock parc d'un contrat ne montre plus de bois déjà parti à la scie.

### 5. Rien n'empêche de scier deux fois un billon ni de solder par erreur un camion entamé

- **Priorité** haute · **type** bug · **effort** S
- **Pages** apps/api/src/routes/production.ts, apps/web/src/components/SawnTruckPicker.tsx, apps/web/src/components/SawnEntry.tsx
- **Constat** POST /production-runs vérifie seulement que les logIds sont des billons girth des camions cochés (production.ts:146-164). Il ne vérifie pas qu'ils sont déjà liés à une autre session. Côté UI, un billon déjà scié reste « recochable » (SawnTruckPicker.tsx:227-236). Plus grave : cocher un camion déjà entamé sans cocher de billon le transforme en « camion entier » (SawnTruckPicker.tsx:178, règle de stock.ts:75-78). Tous ses billons restants sortent du stock parc en silence, alors que le scieur voulait peut-être juste lier le camion.
- **Proposition** Côté serveur, renvoyer 409 si un logId figure déjà dans une session, sauf drapeau explicite `allowResaw`. Si un camion coché a déjà une session avec billons et qu'aucun billon n'est coché, présélectionner ses billons restants (p.remaining) ou demander une confirmation : « Solder les N billons restants (x m³) ? ». Dans le récap de SawnEntry, afficher le girth qui va sortir du parc.
- **Gain** Évite les écarts de stock parc et les rendements à 120 % que l'on découvre seulement à l'inventaire.

### 6. Supprimer un camion ou un relevé efface en silence la traçabilité de sciage et contourne le verrou du contrat

- **Priorité** haute · **type** bug · **effort** S
- **Pages** apps/api/src/routes/trucks.ts, apps/web/src/pages/TruckDetailPage.tsx
- **Constat** DELETE /trucks/:id (trucks.ts:129-140) n'appelle pas ensureTruckContractOpen et supprime en cascade les liens ProductionRunTruck et ContainerTruck. Les avivés restent au stock mais perdent leur camion d'origine. DELETE /measurements/:id (trucks.ts:321-332) n'a ni verrou ni garde, alors que DELETE /logs/:id refuse un billon lié à un débitage (trucks.ts:298-309) : supprimer le relevé entier fait sauter cette protection. PATCH /trucks/:id (trucks.ts:100-126) modifie aussi un camion d'un contrat clôturé. La boîte de confirmation annonce seulement « mesures et packing list effacées » (TruckDetailPage.tsx:346-349).
- **Proposition** Ajouter ensureTruckContractOpen sur PATCH /trucks, DELETE /trucks et DELETE /measurements. Renvoyer 409 si le camion ou un billon du relevé est lié à une session ou à un conteneur (« supprimer d'abord la session du jj/mm »). Dans le dialogue, lister ce qui sera détaché : sessions, conteneurs.
- **Gain** La chaîne bille, session, conteneur ne peut plus être cassée par une mauvaise manipulation au bureau. Un contrat clôturé reste réellement figé.

### 7. Empotage : pas de garde serveur sur le stock, conteneur expédié modifiable, horodatages écrasés

- **Priorité** moyenne · **type** bug · **effort** S
- **Pages** apps/api/src/routes/containers.ts, apps/web/src/components/ContainersSection.tsx, apps/web/src/components/EmpotagePicker.tsx
- **Constat** POST /containers/:id/items (containers.ts:166-186) accepte n'importe quelle quantité, sans regarder sawnInventory : seul le client prévient, sans bloquer (EmpotagePicker.tsx:73-75). On peut ajouter ou supprimer des lignes d'un conteneur SHIPPED (containers.ts:166 et :188 ne lisent pas le statut ; ContainersSection.tsx:401-407 propose de retirer une ligne en un tap, sans confirmation). statusStamp (containers.ts:63-67) réécrit loadedAt à chaque PATCH status=LOADED. La position vaut `_count.items + 1` (containers.ts:176), ce qui crée des doublons après une suppression. containerNo n'est pas unique (schema.prisma:413) hors import.
- **Proposition** Refuser l'ajout ou la suppression de lignes sur un conteneur LOADED ou SHIPPED (revenir à LOADING pour corriger). Ne poser loadedAt et shippedAt que s'ils sont null. Calculer la position avec max(position) + 1. Avertir côté serveur (réponse 200 avec `warnings`) quand une dimension passe en négatif. Ajouter un contrôle d'unicité normalisée du n° de conteneur, à la manière de l'import (imports/service.ts:311). Exiger un n° de plomb avant LOADED.
- **Gain** La packing list imprimée et le conteneur parti au port restent figés. Plus de stock négatif découvert après expédition.

### 8. L'état « scié » d'un camion est binaire : un camion entamé passe pour fini

- **Priorité** moyenne · **type** donnees · **effort** S
- **Pages** apps/api/src/routes/trucks.ts, apps/api/src/routes/summary.ts, apps/web/src/pages/TruckDetailPage.tsx, apps/web/src/components/TruckStatsSection.tsx
- **Constat** `sawn: _count.productionRuns > 0` (trucks.ts:29). Un camion dont 10 billons sur 275 sont passés à la scie s'affiche « Scié » (TruckDetailPage.tsx:106-107), sa section de mesures se replie comme de l'historique (TruckDetailPage.tsx:128) et il porte le badge « scié » (TruckStatsSection.tsx:204). Il est aussi compté dans trucksSawn et retiré de trucksOnParcUncut (summary.ts:140, :237-246). La page Débitage calcule pourtant le vrai avancement avec truckSawnProgress (ProductionSection.tsx:56-59).
- **Proposition** Remplacer le booléen par `sawnState: NONE | PARTIAL | DONE` (avec sawnCount/total), calculé côté serveur par la même règle que truckSawnProgress et parcStock. Afficher « En cours de sciage 10/275 » sur la fiche camion et dans les statistiques. Ne compter dans trucksSawn que les camions DONE, et ajouter un compteur trucksPartial.
- **Gain** Le bureau voit quels camions sont réellement à finir de scier, et le reste à scier du contrat est juste.

### 9. Proposer les camions d'origine d'un conteneur et rechercher une bille ou un billon par numéro

- **Priorité** moyenne · **type** fonctionnalite · **effort** L
- **Pages** apps/api/src/routes/containers.ts, apps/web/src/components/ContainersSection.tsx, apps/api/src/stock.ts, nouvelle route GET /trace
- **Constat** Le lien conteneur → camions se fait entièrement à la main (ContainersSection.tsx:121 et :327 ; containers.ts:4-6 précise qu'il « n'est plus demandé »), et le stock est mutualisé. La traçabilité bille → planche → conteneur, demandée par l'export, est donc presque toujours vide. Aucun endpoint ne permet non plus de retrouver « bille 266 / billon 266B » : il faut connaître le camion (truckMatches ne cherche que l'immat, le B/L, la parcelle et l'origine, lib/trucks.ts:53-59).
- **Proposition** (1) À l'ajout de lignes, calculer des camions candidats en FIFO : les sessions les plus anciennes qui ont produit ces L×l×ép avec du reste disponible (SawnLine → run → trucks), et les présélectionner dans le ChipToggle, l'opérateur validant. (2) Ajouter GET /trace?q=266B, qui renvoie le camion, le contrat, le relevé Ø, les billons, la session de sciage et les conteneurs candidats, avec un champ de recherche global dans Layout.
- **Gain** Une packing list d'export avec ses B/L d'origine (exigence SODEFOR et clients), et une réponse en quelques secondes à « d'où vient ce bois ? ».

### 10. Saisie de débitage et panier d'empotage sans brouillon ni anti-doublon

- **Priorité** moyenne · **type** fonctionnalite · **effort** M
- **Pages** apps/web/src/components/SawnEntry.tsx, apps/web/src/components/EmpotagePicker.tsx, apps/api/src/routes/production.ts, apps/api/src/routes/trucks.ts
- **Constat** TallyEntry sauvegarde un brouillon (lib/tallyDraft, TallyEntry.tsx:108-136). SawnEntry garde ses lignes en simple useState (SawnEntry.tsx:57-62), et le panier d'empotage aussi (EmpotagePicker.tsx:77-87) : un rechargement de la tablette ou une mise en veille fait perdre 40 lignes de sciage. Les mutations en attente hors ligne ne vivent qu'en mémoire (App.tsx:50, pas de persistance). Aucun endpoint n'est idempotent : un POST arrivé au serveur mais dont la réponse s'est perdue, puis re-tapé, crée deux sessions ou deux relevés (c'est le risque cité dans App.tsx:33-34).
- **Proposition** Réutiliser lib/tallyDraft pour SawnEntry (clé `sawn:new`) et pour le panier (`empotage:<containerId>`). Faire générer par le client un `clientRequestId` (uuid) envoyé avec POST /production-runs, /trucks/:id/measurements et /containers/:id/items, stocké avec contrainte unique : un second envoi renvoie la ressource déjà créée.
- **Gain** La saisie survit aux coupures réseau et aux redémarrages de tablette, et aucune session n'est enregistrée deux fois.

### 11. Impossible de corriger une session de débitage, la suppression laisse le stock périmé

- **Priorité** moyenne · **type** ergonomie · **effort** M
- **Pages** apps/api/src/routes/production.ts, apps/web/src/pages/ProductionRunPage.tsx
- **Constat** production.ts n'expose que GET, POST et DELETE (production.ts:32-211), pas de PATCH. Une faute de frappe sur une ligne (12 pièces au lieu de 21) oblige à supprimer la session et à tout ressaisir, y compris la sélection de billons. La suppression n'invalide que production, cutting et contracts (ProductionRunPage.tsx:48-56) : les requêtes stock, trucks et summary restent périmées. Elle n'est pas non plus soumise au verrou du contrat (production.ts:201-211, contrairement à la création, production.ts:137-140).
- **Proposition** Ajouter PATCH /production-runs/:id (date, note, lignes, truckIds, logIds), avec les mêmes validations que POST et recalcul F3/F4 côté serveur. Sur ProductionRunPage, proposer « Modifier », qui rouvre SawnEntry prérempli. Invalider stock, trucks et summary à la suppression, et appliquer le verrou du contrat déduit.
- **Gain** Corriger une erreur prend un tap au lieu d'une ressaisie complète, et le stock se met à jour tout de suite.

### 12. Alerte quota et B/L en double tous contrats, dès la réception

- **Priorité** moyenne · **type** fonctionnalite · **effort** S
- **Pages** apps/web/src/components/ReceptionSection.tsx, apps/api/src/routes/trucks.ts
- **Constat** La jauge de quota n'existe que sur la fiche contrat et les cartes (QuotaGauge utilisé dans ContractDetailPage.tsx:318, ContractsPage, DashboardPage). Le formulaire de réception ne montre pas le quota restant du contrat choisi, et POST /trucks ne le contrôle pas (trucks.ts:53-97). Le contrôle de B/L en double se limite au contrat sélectionné et au client (ReceptionSection.tsx:144-149) : un camion enregistré sur le mauvais contrat avec un B/L déjà saisi ailleurs passe sans avertissement.
- **Proposition** Dans le formulaire, sous le sélecteur de contrat, afficher « Quota restant : X m³ (≈ N camions) » à partir de /contracts/overview, et un Notice warn si le brousse déclaré dépasse ce reste. Vérifier le B/L sur tous les contrats et renvoyer côté serveur un avertissement non bloquant (warnings dans la réponse).
- **Gain** Le portail sait avant le déchargement qu'un camion dépasse le quota SODEFOR, et les erreurs d'affectation de contrat se repèrent tout de suite.

### 13. Import Excel non transactionnel et sans annulation

- **Priorité** moyenne · **type** fonctionnalite · **effort** M
- **Pages** apps/api/src/imports/service.ts, apps/api/src/routes/imports.ts, apps/web/src/pages/ImportPage.tsx
- **Constat** applyImport enchaîne truck.create, logMeasurement.create, productionRun.create et container.create feuille par feuille, sans $transaction (imports/service.ts:372-520). Une erreur à la feuille 4 laisse les feuilles 1 à 3 en base, et le relancer bute ensuite sur « relevé déjà présent ». ImportBatch garde pourtant chaque createdId (applied JSON), mais imports.ts n'expose que preview, apply et history (imports.ts:25, :47, :72) : on ne peut pas annuler un classeur importé sur le mauvais contrat.
- **Proposition** Envelopper l'application dans `prisma.$transaction(async tx => …)`, quitte à fixer un timeout plus long. Ajouter DELETE /imports/:batchId, qui supprime les ressources listées dans applied (dans l'ordre inverse, avec les mêmes gardes que les suppressions unitaires), et un bouton « Annuler cet import » dans l'historique d'ImportPage.
- **Gain** Le repli officiel par import Excel devient sûr : soit tout passe, soit rien, et une erreur de contrat se rattrape en un clic.

### 14. Le resciage consomme une dimension absente sans aucun contrôle

- **Priorité** basse · **type** donnees · **effort** S
- **Pages** apps/api/src/routes/resaws.ts, apps/web/src/components/ResawSection.tsx
- **Constat** Le serveur vérifie seulement produit ≤ consommé (resaws.ts:74-80). Le client compare le consommé au stock m³ par code de taille (ResawSection.tsx:223-229), alors que le resciage consomme une dimension précise L×l×ép : on peut consommer des 12' × 6×4 qui n'existent pas, tant qu'il reste des 8' du même code. sawnInventory passe alors en availableCount négatif (stock.ts:288), et le panier d'empotage le masque par défaut (EmpotagePicker.tsx:55). La perte de trait n'apparaît nulle part.
- **Proposition** Contrôler le consommé contre sawnInventory, dimension par dimension, côté client (avertissement) et côté serveur (warning). Proposer le consommé à partir d'une liste de l'inventaire disponible, comme le panier d'empotage, plutôt qu'en saisie libre. Afficher pour chaque opération la perte (consommé − produit, en m³ et en %).
- **Gain** Pas de stock fantôme créé par un resciage, et un suivi de la perte de matière au resciage.

### 15. Ancienneté du stock parc pour scier les billons dans l'ordre d'arrivée

- **Priorité** basse · **type** fonctionnalite · **effort** S
- **Pages** apps/web/src/pages/StockPage.tsx, apps/web/src/components/ProductionSection.tsx, apps/api/src/stock.ts
- **Constat** parcStock renvoie arrivedAt pour chaque camion (stock.ts:109) et le tri par arrivée, mais la table du stock parc n'affiche que le volume (StockPage.tsx:183). L'avancement du Débitage trie par état, pas par ancienneté (ProductionSection.tsx:60-62). Un camion de teck en attente depuis trois semaines (risque de fentes et de bleuissement) ne ressort nulle part.
- **Proposition** Ajouter une colonne « Sur parc depuis N j » au stock parc et sur les cartes de l'Étalage et du Débitage. Dans « Camions — avancement sciage », trier à état égal par ancienneté, et afficher un badge amber au-delà d'un seuil (par exemple 15 jours, configurable dans features.ts).
- **Gain** Le chef de scierie fait passer le bois le plus ancien en premier et limite la perte de qualité au parc.

## Idées fonctionnelles · contrats-finance-pilotage

### 1. Interdire la suppression d'un contrat qui a de l'activité (elle efface les ventes et regonfle le stock général)

- **Priorité** haute · **type** bug · **effort** S
- **Pages** apps/api/src/routes/contracts.ts, apps/api/prisma/schema.prisma, apps/web/src/pages/ContractDetailPage.tsx
- **Constat** DELETE /contracts/:id (contracts.ts:75-85) appelle prisma.contract.delete sans rien vérifier. Le schéma supprime en cascade Truck (schema.prisma:225), Sale (:369), AccountEntry (:156), ContractExpense (:175) et ImportBatch (:530), alors que ProductionRun, Container et ResawOp passent seulement en SetNull (:331, :410, :476). Comme stockSummary calcule le stock avec produit − Σ saleLines (stock.ts:126-129, 149-153), les m³ déjà vendus et expédiés reviennent dans le stock général. Les dépenses SODEFOR/Ibrahim et le journal des imports disparaissent aussi. Le dialogue (ContractDetailPage.tsx:260-275) le dit, mais le seul garde-fou est de retaper le n° du contrat.
- **Proposition** Côté API, compter trucks, sales, accountEntries, expenses et importBatches avant le delete et répondre 409 {error, counts} dès qu'un compte est > 0. Seul un contrat vide (créé par erreur) reste supprimable. Côté UI, si le résumé montre de l'activité, remplacer le bouton Supprimer par « Clôturer le contrat » (PATCH status CLOSED, déjà verrouillé par contract-lock.ts) et afficher les compteurs renvoyés par le 409.
- **Gain** Une fausse manœuvre ne peut plus faire réapparaître du bois vendu dans le stock, ni effacer le coût SODEFOR et l'historique camions d'un contrat. Les chiffres déclarés à SODEFOR et au client restent justifiables.

### 2. Sessions de débitage multi-contrats : débité, rendement et stock parc du contrat sont faux

- **Priorité** haute · **type** bug · **effort** M
- **Pages** apps/api/src/routes/production.ts, apps/api/src/routes/summary.ts, apps/api/src/routes/expenses.ts, apps/api/src/routes/reports.ts, apps/api/src/routes/exports.ts
- **Constat** Une session qui mélange des camions de deux contrats reçoit contractId = null (production.ts:124-128). Toutes les vues par contrat filtrent ensuite sur run.contractId. Le résumé ne compte donc pas ce débité (summary.ts:206-209) et retire ces liens camions/billons (summary.ts:218-229) : les billons sciés de ces camions restent dans « Stock parc (billons) » du contrat, alors que /stock/parc, qui ne filtre pas, les compte comme sciés (stock.ts:48-59). En même temps, trucksSawn les compte comme sciés via _count.productionRuns (summary.ts:237-239). La vue liste (summary.ts:105-107), la ligne 1" des Dépenses (expenses.ts:33-35), le Cutting et l'export (exports.ts:455-466) perdent aussi ce volume. À l'inverse, truck-stats inclut ces sessions (reports.ts:37-38) et les répartit ÷ nombre de camions (reports.ts:77-89). Résultat : le tableau par camion ne totalise pas le débité du résumé.
- **Proposition** Ajouter un helper API unique allocateRunsToContracts(runs) qui répartit les lignes de chaque session entre les contrats au prorata du girth scié de chaque camion (même règle F6 : billons cochés, ou camion entier s'il n'en a aucun). L'utiliser dans summary, overview, expenses, cutting et l'export. Pour le stock parc d'un contrat, prendre tous les liens ProductionRunTruck/ProductionRunLog des camions du contrat, sans filtrer sur run.contractId. Dans truck-stats, remplacer le ÷ n par la même quote-part au girth. Si le helper doit vivre dans packages/shared, le noter en deferred.
- **Gain** Un rendement et un stock parc justes même quand la scie enchaîne des billons de deux contrats dans la même journée, ce qui est le cas normal avec un stock général. La somme des lignes camion retombe sur le total du contrat.

### 3. Import Excel : un débitage sans camion est imputé au contrat (rendement gonflé), et un réimport le crée en double

- **Priorité** haute · **type** bug · **effort** S
- **Pages** apps/api/src/imports/service.ts
- **Constat** Une feuille SAWN sans camion identifié ne produit qu'un avertissement (service.ts:234-238). La session est ensuite créée avec contractId = contrat de l'import (service.ts:465-473), au lieu de null comme le veut production.ts:124-128. Le débité compte pour le contrat sans billons au dénominateur, et outputPct monte. Le contrôle de doublon des sessions ne joue que si un camion est trouvé (service.ts:292-301) : réimporter le même classeur DEBITES recrée la session et double le stock général. ImportBatch garde le nom du fichier mais aucune empreinte du contenu.
- **Proposition** (1) Sans camion lié : contractId null, comme une saisie manuelle. (2) Calculer une empreinte sha256 par feuille (type + date + lignes normalisées) et la stocker dans ImportBatch.applied. En preview, passer la feuille en erreur « déjà importée le JJ/MM par X » si l'empreinte existe déjà. (3) Le message conteneur « déjà présent sur ce contrat » (service.ts:317) doit dire « déjà empoté » : le contrôle porte sur tous les conteneurs.
- **Gain** L'import Excel est le plan B officiel quand la tablette du parc tombe. Il ne doit pas créer de m³ fantômes ni fausser le rendement que le bureau lit chaque jour.

### 4. Export Excel du contrat : la feuille Comptes montre l'argent sans la permission Finances, et le quota manque

- **Priorité** haute · **type** bug · **effort** S
- **Pages** apps/api/src/routes/exports.ts
- **Constat** L'export ne demande que contracts.export (permissions.ts:47). L'argent du Résumé est bien gardé par showMoney (exports.ts:446-447, 524). En revanche, la feuille « Comptes » (exports.ts:592-606) part toujours, avec tous les montants dû/payé par tiers. Un compte Parc qui a l'export voit donc les paiements SODEFOR/Ibrahim. De plus, le Résumé (exports.ts:513-523) n'a ni le cubage brousse, ni le % de quota consommé, ni le reste : ce sont pourtant les chiffres SODEFOR du contrat. Enfin, il n'y a aucune feuille Dépenses, alors que l'onglet Dépenses est le seul suivi financier encore actif (features.ts : ventes et compta en veille).
- **Proposition** Ne créer la feuille Comptes que si showMoney. Ajouter au Résumé les lignes « Brousse m³ (quota) », « Quota consommé % » et « Reste quota m³ », avec la même règle que le résumé (étalage brousse > packing list > déclaré). Ajouter, si showMoney, une feuille « Dépenses » : lignes calculées (poste, quantité, unité, prix, montant), dépenses ajoutées, total. Pour cela, sortir contractQuantities d'expenses.ts dans un module API partagé.
- **Gain** Corrige une fuite de données financières vers les comptes de saisie. Le classeur envoyé au gérant ou à SODEFOR contient enfin la consommation du quota et le coût réel du contrat, sans recopie à la main.

### 5. Rapport d'activité : un rapport du site entier, pas par contrat (l'empotage n'y apparaît plus jamais)

- **Priorité** haute · **type** fonctionnalite · **effort** M
- **Pages** apps/api/src/routes/reports.ts, apps/web/src/pages/RapportPage.tsx, apps/web/src/lib/features.ts
- **Constat** Le rapport du jour est calculé par contrat (reports.ts:187-240). Il cherche les conteneurs par contractId (reports.ts:235-238), or les conteneurs ne portent plus de contrat depuis le stock général (containers.ts:100-115 ne pose pas contractId). La section EMPOTAGE est donc toujours vide pour les nouveaux conteneurs. Les sessions multi-contrats (contractId null, reports.ts:213-214) disparaissent aussi. Côté UI, RapportPage passe par StepLayout et oblige à choisir un contrat (RapportPage.tsx:107-108). Le vrai rapport (docs/rapportactivité.txt, ligne « CAMION 3201 GS 01 BL 176530 SANGOUE A3-2026-014 ») est un rapport du site, avec le n° de contrat sur chaque camion. La page est en veille (features.ts : report=false).
- **Proposition** Créer GET /daily-report?date= (contractId optionnel en filtre) qui couvre tous les camions arrivés, relevés, sessions et conteneurs chargés du jour. Chaque ligne camion porte contrat, forêt et parcelle comme le texte d'origine. Ajouter en pied de rapport le stock de fin de journée (parc + produits, /stock/summary) et, pour chaque contrat ouvert, le cumul brousse / quota. Garder la route par contrat pour la compatibilité. Réactiver le flag une fois validé.
- **Gain** Remplace vraiment le rapport tapé à la main tous les soirs (entrées, étalage, débité, TC empotés), sans le reconstituer contrat par contrat ni perdre les conteneurs.

### 6. Alertes de pilotage : dépassement de quota à la réception, échéance du contrat, camions qui attendent la scie

- **Priorité** haute · **type** fonctionnalite · **effort** M
- **Pages** apps/api/src/routes/summary.ts, apps/web/src/components/QuotaGauge.tsx, apps/web/src/components/ReceptionSection.tsx, apps/web/src/pages/DashboardPage.tsx
- **Constat** Rien n'empêche ni ne signale un camion qui fait dépasser le quota : POST /trucks ne regarde pas le quota (trucks.ts:59 ne vérifie que le verrou) et le formulaire de réception (ReceptionSection.tsx:89-130) non plus. La jauge borne le reste à 0 (QuotaGauge.tsx:61) et affiche « Quota atteint — plus aucun camion nécessaire » en vert même en cas de dépassement (:113-117). Le dépassement en m³ n'est jamais chiffré. signedAt + durationMonths sont saisis mais seulement affichés (ContractDetailPage.tsx:198-199) : l'échéance n'est jamais calculée. Le tableau de bord n'a aucune zone d'alerte (DashboardPage.tsx:192-217).
- **Proposition** Ajouter au résumé et à la vue liste overQuotaM3, expiresAt (exploitationStartAt ou signedAt + durationMonths) et daysLeft. À la réception, si brousse déclarée + brousse cumulée > quota, afficher un avertissement non bloquant avant validation (« ce camion dépasse le quota de X m³ »). Sur la jauge, passer en rouge avec « Dépassé de X m³ ». Sur le tableau de bord, ajouter une bande « À surveiller » : quota ≥ 90 % ou dépassé, échéance dans moins de 30 jours, camions sur parc non sciés depuis plus de N jours (parcStock donne arrivedAt), tailles en stock négatif.
- **Gain** Le bureau voit le dépassement de quota SODEFOR avant de décharger le camion, pas après. Il voit venir la fin du contrat et les billons qui sèchent au parc.

### 7. Contrat clôturé : les suppressions passent encore malgré la « lecture seule »

- **Priorité** moyenne · **type** bug · **effort** S
- **Pages** apps/api/src/routes/sales.ts, apps/api/src/routes/accounts.ts, apps/api/src/routes/trucks.ts
- **Constat** contract-lock.ts annonce « plus aucune opération métier » et l'UI affiche « lecture seule ». Pourtant DELETE /sales/:id (sales.ts:78), DELETE /account-entries/:id (accounts.ts:60), DELETE /trucks/:id (trucks.ts:129) et DELETE /measurements/:id (trucks.ts:321) ne passent pas par ensureContractOpen. On peut donc effacer une vente, un paiement ou un relevé d'un contrat clos. Supprimer un camion déjà scié détruit en plus ses liens ProductionRunTruck/Log en cascade, et le débité reste sans dénominateur. DELETE /contract-expenses fait déjà la vérification (expenses.ts:135-143).
- **Proposition** Appliquer le même schéma que expenses.ts : charger contractId (ou truckId → contrat) puis ensureContractOpen / ensureTruckContractOpen avant le delete, dans sales.ts et accounts.ts. Pour trucks.ts (hors périmètre de ce rôle, à confier au backend) : même verrou, plus un 409 si le camion est lié à une session de débitage, sauf confirmation explicite.
- **Gain** Un contrat clôturé reste figé. Les chiffres remis à SODEFOR et au client ne bougent plus après la clôture.

### 8. Dépenses : coût de revient au m³, budgets comparés au réalisé, profit sur les vraies dépenses

- **Priorité** moyenne · **type** fonctionnalite · **effort** M
- **Pages** apps/api/src/routes/expenses.ts, apps/api/src/routes/summary.ts, apps/web/src/components/ExpensesSection.tsx
- **Constat** Les budgets Wood/Company/Export sont saisis (schema.prisma:94-97, ContractSections.tsx:95-100) mais ne sont comparés à rien. L'onglet Dépenses s'arrête à trois totaux (ExpensesSection.tsx:149-153) : pas de FCFA/m³ brousse, ni FCFA/m³ débité, ni FCFA/camion. Le « Profit estimé » vaut CA − Σ dûs tiers (summary.ts:480), alors que les dûs sont en veille et que le coût suivi est le total des Dépenses. Les dépenses ajoutées n'ont qu'un libellé libre (schema.prisma:176) : on ne peut pas totaliser carburant ou réparations. Les suggestions de dûs ne suivent pas non plus les Dépenses : la suggestion SODEFOR ne prend que les forfaits (summary.ts:557-561) et ignore sodeforPrice × brousse, que la ligne Dépenses compte (expenses.ts:102).
- **Proposition** Ajouter à la réponse de /contracts/:id/expenses costPerBrousseM3, costPerDebitedM3 et costPerTruck, plus un bloc budget : woodBudget face à (SODEFOR + Ibrahim + transport + cubage + forfaits), en % consommé, ambre au-delà de 90 %. Calculer profitEstimate = CA − total dépenses quand la compta est en veille. Ajouter une catégorie (enum : carburant, réparation, main-d'œuvre, administratif, divers) aux dépenses ajoutées, avec un sous-total par catégorie. Dériver les suggestions de dûs des lignes calculées.
- **Gain** Le gérant sait combien lui coûte le m³ débité d'un contrat et s'il tient son budget bois, pendant le contrat et pas à la fin.

### 9. Cubage brousse par camion : la packing list est ignorée dans l'analyse par camion, l'export et le rapport

- **Priorité** moyenne · **type** donnees · **effort** S
- **Pages** apps/api/src/routes/reports.ts, apps/api/src/routes/exports.ts
- **Constat** Le quota et les Dépenses prennent la brousse dans l'ordre étalage FIELD > packing list > déclaré (summary.ts:337-341, expenses.ts:51-57). truck-stats ne charge pas les packingLogs (reports.ts:27-33) et retombe directement sur le déclaré (reports.ts:132). L'export (exports.ts:576) et le rapport du jour (reports.ts:258-269) font de même. Quand le total du bordereau diffère de la somme des lignes de la spécification, la colonne Brousse du tableau ne totalise plus le cubage du quota. Le Cost/m³ par camion (truckCostCfa, reports.ts:147-154) n'utilise pas non plus la même quantité SODEFOR que la ligne Dépenses.
- **Proposition** Créer un helper unique truckBrousseM3(truck) (field > packing > declared) et l'utiliser dans truck-stats, l'export (feuilles Camions et Résumé), le rapport du jour et overview. Il irait dans packages/shared, en lecture seule ici : à placer en deferred, ou dans un module API en attendant. Inclure packingLogs: { select: { volumeM3 } } dans les requêtes concernées.
- **Gain** Un seul chiffre brousse par camion sur tous les écrans et dans tous les classeurs. C'est la base du quota et du paiement SODEFOR.

### 10. Ventes (à réactiver) : contrôle de disponibilité sur le stock général, côté serveur, sans trou sur les tailles absentes

- **Priorité** moyenne · **type** bug · **effort** S
- **Pages** apps/web/src/components/SalesSection.tsx, apps/web/src/pages/VentesPage.tsx, apps/api/src/routes/sales.ts
- **Constat** La disponibilité vient du stock du contrat (VentesPage.tsx:15-20 → summary.stockBySize). Ce stock exclut les sessions multi-contrats et tout le resciage, qui n'ont pas de contrat (stock.ts:120-135). Une taille issue d'un resciage paraît donc introuvable. Une taille absente du stock donne dispo = null, et la ligne sort du calcul de survente (SalesSection.tsx:82-95) : on peut vendre 10 m³ d'une taille qui n'existe pas sans aucun avertissement. Le serveur ne vérifie rien (sales.ts:116-153). Le B/L s'affiche sur la carte (SalesSection.tsx:351) mais ne se saisit nulle part. Après une vente, ni ["stock"] ni ["contracts","overview"] ne sont invalidés (SalesSection.tsx:68-71).
- **Proposition** La vente reste rattachée à un contrat (règle métier), mais la disponibilité se lit sur /stock/summary, le stock général. Une taille inconnue vaut dispo 0. POST /sales recalcule la disponibilité et répond 409 avec le détail, sauf si force=true, qui doit alors être tracé dans note. Ajouter les champs B/L et note au formulaire, et invalider les clés stock et overview.
- **Gain** Quand le volet commercial sera remis en ligne, il ne pourra pas vendre du bois qui n'existe pas ni bloquer une vente de bois bien présent au stock général.

### 11. Relier la vente au conteneur : aujourd'hui deux stocks contradictoires sur la même page

- **Priorité** moyenne · **type** donnees · **effort** L
- **Pages** apps/api/prisma/schema.prisma, apps/api/src/stock.ts, apps/web/src/pages/StockPage.tsx
- **Constat** Le stock en m³ vaut produit + rescié − vendu, sans retirer l'empoté (stock.ts:119-135, 199-207). Le stock en pièces vaut produit + rescié − empoté, sans retirer le vendu (stock.ts:210-233, 288). La page Stock affiche les deux côte à côte (StockPage.tsx:128-133) : un TC empoté puis vendu sort une fois de chaque chiffre, jamais des deux. Sale n'a aucun lien vers Container (schema.prisma:366-380). On ne sait donc pas quel conteneur a été vendu à quel client et à quel prix.
- **Proposition** Ajouter une table SaleContainer (saleId, containerId). Une vente de conteneur prend ses lignes taille/m³ dans les ContainerItem (prix saisi par taille) et le stock ne déduit le volume qu'une fois : stock produits = produit + rescié − empoté − vendu hors conteneur. Côté conteneur, afficher la vente liée (client, montant) et un statut « vendu ». Migration Prisma à planifier hors de ce lot (verrou Windows).
- **Gain** Un seul chiffre de stock juste. Pour chaque TC MRKU…, on sait qui l'a acheté et pour combien : c'est la base de la facturation export.

### 12. Recherche et fiche de traçabilité : bille, B/L ou conteneur, et remonter jusqu'à la forêt

- **Priorité** moyenne · **type** fonctionnalite · **effort** M
- **Pages** apps/api/src/routes (nouvelle route search), apps/web/src/pages (nouvelle page), apps/api/prisma/schema.prisma
- **Constat** L'API n'a aucune route de recherche (grep search/recherche vide dans apps/api/src). Pour retrouver « bille 266 », « B/L 176530 », « BON 2256… » ou « MRKU 684202 », il faut choisir le contrat, ouvrir chaque camion et défiler. Le lien conteneur → camions d'origine (ContainerTruck, schema.prisma:431-440) est facultatif et coché à la main (containers.ts:93-98) : la chaîne bille → billon → session → conteneur n'est jamais présentée d'un seul tenant.
- **Proposition** Créer GET /search?q= qui interroge truck.deliveryNote, bonNo, bookletNo, registration, log.externalId (266 et 266A…), packingLog.billNo, container.containerNo, sealNo et bookingNo, avec 10 résultats typés au plus. Ajouter un champ de recherche dans l'en-tête et une page « Traçabilité » : conteneur → camions liés → contrat, forêt, parcelle, B/L, BON → sessions de débitage. Pour un camion : billes → billons → sessions qui les ont sciés → conteneurs qui l'ont lié.
- **Gain** Répondre en dix secondes à SODEFOR, à la douane ou au client sur l'origine d'un conteneur ou d'une bille, au lieu de fouiller trois classeurs.

### 13. Annuler un import Excel depuis l'historique

- **Priorité** moyenne · **type** fonctionnalite · **effort** M
- **Pages** apps/api/src/imports/service.ts, apps/api/src/routes/imports.ts, apps/web/src/pages/ImportPage.tsx
- **Constat** Chaque feuille appliquée garde déjà createdId (relevé, session ou conteneur) et createdTruck dans ImportBatch.applied (service.ts:439-446, 475-482, 509-515). Pourtant, la seule réponse à un mauvais import est « le supprimer dans l'app avant de réimporter » (service.ts:247, 299) : il faut retrouver à la main chaque relevé, session ou conteneur, sur plusieurs pages.
- **Proposition** Créer DELETE /imports/:batchId, avec la permission delete du type de chaque feuille et le verrou contrat. En transaction, supprimer les createdId du batch, puis les camions créés par l'import s'ils n'ont aucune autre donnée. Marquer le batch « annulé » plutôt que le supprimer. Dans l'historique de ImportPage, ajouter un bouton « Annuler cet import » avec un récapitulatif (feuilles, m³, camions créés).
- **Gain** Le repli Excel devient sûr : un mauvais classeur ou une erreur de contrat se défait en un clic, sans débitage ou conteneur orphelin dans le stock.

### 14. Mots de passe : rien pour réinitialiser celui d'un utilisateur ni changer le sien

- **Priorité** moyenne · **type** fonctionnalite · **effort** S
- **Pages** apps/web/src/pages/UsersPage.tsx, apps/api/src/routes/auth.ts, apps/api/src/permissions.ts
- **Constat** PATCH /users/:id accepte password (users.ts:493-512), mais UserCard ne propose que rôle, permissions et activer/désactiver (UsersPage.tsx:141-200). Il n'existe aucune route pour changer son propre mot de passe : /users est réservé à l'admin (permissions.ts:28) et auth.ts n'a que login/me. L'admin initial est créé avec admin123 par défaut (auth.ts:99). Un chef de parc qui oublie son mot de passe sur la tablette bloque la saisie jusqu'à une intervention en base.
- **Proposition** Ajouter un bouton « Réinitialiser le mot de passe » dans UserCard (champ et confirmation, PATCH existant). Créer POST /auth/password {current, next}, libre pour tout connecté, avec un menu « Mon compte » dans le Layout. Après un login avec le mot de passe par défaut, imposer le changement (flag mustChangePassword, migration à planifier).
- **Gain** Personne n'est bloqué hors de l'app pour un mot de passe oublié, et le compte admin par défaut ne reste pas ouvert en production.

### 15. Journal des opérations : savoir qui a supprimé ou modifié quoi

- **Priorité** basse · **type** fonctionnalite · **effort** M
- **Pages** apps/api/prisma/schema.prisma, apps/api/src/auth.ts, apps/web/src/pages/AdminPage.tsx
- **Constat** Seul ImportBatch garde un userId (schema.prisma:531). Truck, LogMeasurement, ProductionRun, Sale, AccountEntry et ContractExpense n'ont ni createdBy ni trace de suppression. Or chaque écran propose des suppressions irréversibles (ConfirmDialog « Action irréversible », SalesSection.tsx:387, ExpensesSection.tsx:311), et les tablettes du parc sont partagées.
- **Proposition** Ajouter une table AuditLog (at, userId, method, path, entity, entityId, before JSON pour les DELETE). Elle serait alimentée par un hook onResponse pour les POST/PATCH/DELETE réussis, la suppression lisant la ligne avant destruction dans les routes sensibles : contrats, camions, relevés, sessions, ventes, dépenses. Ajouter createdById sur ContractExpense et Sale. Créer une page Admin « Journal » filtrable par contrat, utilisateur et date.
- **Gain** Quand un relevé de 60 billes ou une dépense de 500 000 FCFA disparaît, on sait qui et quand, et on peut la ressaisir à l'identique depuis le contenu journalisé.

## Reportés par les agents (hors périmètre ou décision métier)

### backend-api

- **haute** · apps/api/package.json + index.ts : Add @fastify/rate-limit on POST /auth/login, for example 10 attempts per IP per minute. It is a new dependency in package.json, which is outside my files. There is no brute-force protection today; only the timing leak was fixed.
- **moyenne** · apps/api/src/imports/service.ts (applyImport) : Put each sheet in its own prisma.$transaction (truck creation, then reading, session or container), and record the truck in `created` only after commit. resolveVehicle in apps/api/src/vehicles.ts would need an optional tx parameter. Today, if writing one sheet fails, the truck stays without its reading, the import stops halfway with a 500 and no ImportBatch is logged.
- **moyenne** · apps/api/src/imports/service.ts (feuille SAWN) : Business decision needed. An imported sawing session with no identified truck gets contractId = the import contract. The rule is that a session's contract is deduced from its trucks, null when there are none. Setting null would change the contract's sawn total and yield, so it was left as is.
- **moyenne** · apps/api/src/routes/containers.ts / production.ts / resaws.ts : Business decision needed. The server never checks available stock: an container can hold more pieces than sawnInventory().availableCount, and a resaw can consume a size that is not in stock. Only the web UI limits this. A server-side 409 would protect concurrent entries from two tablets.
- **basse** · apps/api/src/routes/production.ts (POST) : Possible guard: refuse logIds already linked to another session ('billon déjà scié'). Not done because a billon might legitimately be sawn over two sessions; confirm with the business first.
- **basse** · apps/api/src/routes/trucks.ts (POST /measurements/:id/logs) : Positions are computed as max+1 outside any lock, so two tablets adding to the same reading at once get duplicate positions. A real fix needs a @@unique([measurementId, position]) index (migration) with a retry, or a SELECT ... FOR UPDATE.
- **basse** · apps/api/src/routes/contracts.ts (PATCH) : A closed contract can still be edited (quota, prices, administrative fields) without reopening it. Deciding whether PATCH on a CLOSED contract should only accept status/note is a business choice, and today's UI may rely on the current behaviour.
- **basse** · apps/api/src/imports/service.ts (message conteneur) : The message 'Conteneur … déjà présent sur ce contrat' is outdated: the duplicate check now covers all containers in the general stock. Change it to 'déjà enregistré'. This is text that preview shows in the web, which is why I did not change it here.

### ui:etalage-tablette

- **moyenne** · components/ui/ConfirmDialog.tsx : The overlay still uses backdrop-blur-[2px], which is banned by the Atelier rules. Another agent is editing this file right now (new tone/pendingLabel props). Remove the blur from the overlay.
- **moyenne** · components/ui/Button.tsx : Add a 'link'/'text' variant (underlined text, min-h-touch, focus ring). The text links in the parc panel ('Fiche camion', 'Compléter sur la fiche camion', 'Toutes (n)', 'Repartir à zéro') each repeat their classes and their focus ring inline.
- **basse** · components/ui/Feedback.tsx (Notice) : Add an optional action slot to Notice (button aligned right, justify-between). The children wrapper has no flex-1, so 'Repartir à zéro' in TallyEntry has to sit inline after the text instead of aligned right.
- **basse** · components/icons.tsx : Add an IconWifiOff/IconCloudOff icon. The offline notices in TallyEntry fall back to IconInfo/IconAlert, while a dedicated network icon would read at a glance at the yard.
- **basse** · components/ui (primitive) : Create a shared Kbd primitive (or kbdCls in ui). TallyEntry defines kbdCls locally, and SawnEntry probably has the same keyboard cheat sheet.
- **basse** · components/MeasurementTable.tsx : The append block wraps TallyEntry in 'border border-brand-200 bg-brand-50' and the Annuler button is styled inline. Switch to a white surface (cardCls) and Button. The sticky column header of TallyEntry (sm:bg-white) clashes on brand-50.
- **basse** · lib/format.ts : Add fmtSignedInt(n) (+2 / −3 with a real minus) and fmtSignedM3. EtalageSection and TallyEntry each build the sign by hand ('+' prefix + fmtM3, and signed() locally).
- **basse** · TallyEntry Valider button : When saving, show a spinner in the Button primitive (loading prop) instead of text only. The label changes, but nothing moves while the request is in flight on a slow yard network.

### ui:shell-admin-primitives

- **haute** · apps/api/src/routes/users.ts : Add a server-side guard against deactivating or demoting the last active ADMIN. Today only the UI blocks it, and only for your own account.
- **moyenne** · apps/api users + packages/shared UserDTO : Expose `lastLoginAt` and sort the list (active first, then by name). This would let the Utilisateurs tab show dormant accounts.
- **moyenne** · App.tsx + new 'Mon compte' page : Let every user change their own password (current password + new one). Today only the admin can reset it, from the Admin tab.
- **basse** · components/ContractPicker.tsx : Change the default `emptyLabel` from '— Choisir —' (glyph dashes) to 'Choisir un contrat', the way StepLayout now does, for the other callers.
- **basse** · lib/auth (session) / Permissions : Permissions reach accounts within 30 s by polling. After saving the matrix, a cross-tab broadcast or an immediate refetch of the user would shorten that delay.
- **basse** · Other pages using ConfirmDialog (AccountsSection, ContainersSection, ExpensesSection, ResawSection) : Pass `pendingLabel` where the action is not a deletion (for example a closure), and `tone="primary"` for reversible actions. Defaults are unchanged, so nothing is broken.
- **basse** · components/ui/Input.tsx (Field) : Add an optional `as="div"` prop to Field for non-input controls (SelectField, DateField). A <label> around a combobox button is odd, and UsersPage currently uses a div+span by hand for the Rôle field.

### ui:parc-reception-camions

- **moyenne** · components/ui (primitive IconButton) : Créer un IconButton (carré 44px, variants neutre et danger, aria-label obligatoire, focus visible). MeasurementTable recopie quatre fois le même bouton crayon/croix à la main, et d'autres écrans (TallyEntry, SawnEntry) ont sans doute le même motif.
- **moyenne** · MeasurementTable (volumes par ligne) : Trancher la question des volumes de ligne du relevé : ils restent en fmtNum (jusqu'à 6 décimales) parce qu'ils se comparent au classeur et que les totaux à 6 décimales ne doivent pas bouger. Passer à fmtDec3 alignerait les virgules mais masquerait la précision. C'est une décision métier, je n'y ai pas touché.
- **basse** · components/ui/Button.tsx : Ajouter une variante « warn » (ambre) ou « link » (texte souligné 44px). Il n'y en a aucune pour une action de confirmation d'écart ou un lien d'action inline ; j'ai dû me rabattre sur secondary.
- **basse** · components/ui/Feedback.tsx (Notice) : Ajouter une prop `action` à Notice (bouton aligné à droite, qui passe sous le texte sur téléphone). ReceptionSection imbrique aujourd'hui un flex dans les children pour le bouton « Étaler ses billes ».
- **basse** · lib/format.ts : Exporter un helper fmtSigned(n) (signe + ou vrai moins) et un fmtDateShort (« 14 oct. »). TruckCard et TruckDetailPage recalculent localement le signe des écarts et les formats de date.
- **basse** · components/ui/Table.tsx / TruckStatsSection : La cellule Camion, désormais cliquable (min-h-touch), fait passer les lignes de l'analyse par camion à environ 44px. Si c'est trop haut sur desktop, prévoir dans TableWrap une option « row link » qui étend la zone de tap par pseudo-élément sans grandir la ligne.
- **basse** · components/Layout.tsx (PageHeader) : Le subtitle de PageHeader est en `short:hidden` et n'accepte qu'une string. Permettre un ReactNode (pour tabular-nums ou un compteur atténué) servirait à la synthèse du parc dans CamionsPage.
- **basse** · pages/TruckDetailPage (BackLink) : Le lien retour pointe toujours vers le contrat (ou /reception en erreur), alors qu'on arrive surtout de la Réception, de l'Étalage ou de l'analyse par camion. Un retour contextuel (state du router ou ?from=) se ferait plutôt dans lib/ ou App.tsx.

### ui:production-stock-empotage

- **moyenne** · components/icons.tsx : Ajouter IconMinus (path M5 12h14) à côté d'IconPlus. EmpotagePicker en définit un en local en attendant ; il faudra le remplacer par l'import une fois l'icône ajoutée.
- **moyenne** · components/ui/ConfirmDialog.tsx : Le voile utilise backdrop-blur-[2px] (interdit par la direction). Le passer à un aplat bg-brand-950/50 seul. Ajouter aussi une prop error pour afficher l'échec de la mutation dans le dialogue (aujourd'hui passé en children dans ProductionRunPage et ResawSection). Un autre agent modifie ce fichier en ce moment.
- **moyenne** · components/ui/Button.tsx : Prévoir une taille icon (w-11 px-0, carrée 44px) : les overrides de padding en className ne gagnent pas l'ordre Tailwind (px-3 généré après px-0), d'où les !px-0 et !px-2.5 dans EmpotagePicker. Même remarque pour inputQuietCls (px-2.5) : une variante compacte centrée éviterait le !px-1.
- **moyenne** · SawnEntry / ResawSection / EmpotageEntry : Les trois grilles de saisie dimensions dupliquent rowInfo, COL_LABELS, l'en-tête et la ligne (environ 80 lignes chacune). Extraire un composant partagé (DimsRowsEditor) hors de ce lot, en gardant l'ordre DOM et le chaînage Entrée sur Nbr.
- **basse** · components/ui/Badge.tsx : Ajouter un ton plein 'strong' (bg-brand-900 text-white) pour la pastille de total : c'était le seul usage de badge restylé en ligne, remplacé ici par une KpiStrip.
- **basse** · components/ui/Kpi (Card.tsx) : Kpi : appliquer tabular-nums à la valeur par défaut. Les pages l'enveloppent aujourd'hui dans un span tabular-nums (Stock, ProductionRunPage).
- **basse** · lib/format.ts : Ajouter un helper plural(n, mot). Les pluriels « s » à la main se répètent dans ProductionSection, SawnEntry, ContainersSection, EmpotagePicker et ResawSection.
- **basse** · Table primitives (ui/Table.tsx) : StockPage et ContainersSection gardent des th/td bruts (pr-4, colonnes masquées en sm, cellules figées). Une prop padding sur Th/Td (pr-4) permettrait de les migrer sans perdre l'alignement actuel.

### ui:contrats-commerce-finance

- **moyenne** · components/ui/ConfirmDialog.tsx : Le voile utilise backdrop-blur-[2px], banni par la direction UI. Le retirer et garder seulement bg-brand-950/50. Un autre agent édite déjà ce fichier.
- **moyenne** · components/ui/Card.tsx (Kpi) : Ajouter tabular-nums à la valeur de Kpi dans la primitive. Aujourd'hui chaque page doit le poser sur le conteneur KpiStrip ou la grille, comme je l'ai fait pour Dashboard, Compta, Dépenses et la fiche Contrat.
- **moyenne** · components/ui/Button.tsx : Ajouter une variante « ghost » neutre (texte brand-600, hover:bg-brand-100). Les boutons Modifier/Annuler de ContractSections, la ligne dépliable « Voir les N lignes » de l'import et les boutons icône de suppression sont encore restylés en ligne, faute de variante.
- **moyenne** · components/ui/Button.tsx ou nouvelle primitive IconButton : Créer une primitive IconButton (44×44, aria-label obligatoire, tone danger) pour remplacer les boutons de suppression IconX restylés en ligne. Ils sont dupliqués dans SalesSection, AccountsSection, ExpensesSection, ContainersSection et ResawSection.
- **basse** · components/ui/Badge.tsx : Ajouter un ton « danger » (rouge) : un dû en compta est rendu en amber faute de ton rouge. Le span rouge maison a été retiré au profit de la primitive.
- **basse** · components/ui/Feedback.tsx (Notice) : Ajouter une taille compacte (py-1.5) pour les listes d'anomalies d'import. Aujourd'hui elle passe par className="py-1.5", qui dépend de l'ordre des classes Tailwind face au py-2.5 de base.
- **basse** · components/ui/SelectField.tsx / usages : Harmoniser les placeholders décoratifs « — aucun — » / « — Choisir — » en « Aucun » / « Choisir un contrat » (microcopie). Ils sont utilisés aussi par StepLayout et d'autres pages.
- **basse** · components/StepLayout.tsx : La carte « Choisir un contrat » utilise rounded-2xl alors que la règle des surfaces est rounded-xl, et l'EmptyState « Aucun contrat » contient un lien souligné sans cible tactile 44px. Le remplacer par buttonCls("primary","md").
- **basse** · Libellés métier (ContractSections, fiche Contrat, Compta) : Libellés anglais « Full cost », « Wood/Company/Export budget » : à confirmer avec l'utilisateur (vocabulaire du classeur ?) avant de les traduire (« Coût complet », « Budget bois »…).
- **basse** · apps/api summary / overview : Exposer dans le résumé un indicateur de dépassement de quota (ou un statut) pour que le tableau de bord puisse signaler en tête les contrats au-delà de 100 %. Côté front, la jauge le montre déjà.
