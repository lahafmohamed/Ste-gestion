import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { MeasurementCreateInput, TruckDTO } from "@ste/shared";
import { measurementTotalM3, truckBillCount, truckBillNos } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtInt, fmtM3, fmtPct } from "../lib/format";
import { declaredOf, diaOf, girthOf, invalidateTrucks, parcStage, truckMatches } from "../lib/trucks";
import TallyEntry from "./TallyEntry";
import { clearTallyDraft } from "../lib/tallyDraft";
import TruckCard from "./TruckCard";
import Badge from "./ui/Badge";
import Button, { buttonCls } from "./ui/Button";
import { Kpi, KpiStrip, SectionHeading, cardCls } from "./ui/Card";
import { EmptyState, Notice, QueryError } from "./ui/Feedback";
import { SearchInput } from "./ui/Input";
import { SkeletonLine, SkeletonList } from "./ui/Skeleton";
import { IconArrowRight, IconCheck, IconChevronRight, IconLock } from "./icons";

// Anneau de focus des liens-texte du poste parc (même tracé que Button).
const focusCls =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

/** Écart compté (billes) avec un vrai signe : « +2 », « −3 », « 0 ». */
function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** Ligne du récap enregistré : libellé à gauche, chiffre et verdict à droite. */
function RecapRow({ label, value, badge }: { label: string; value: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <dt className="text-brand-600">{label}</dt>
      <dd className="flex flex-wrap items-center justify-end gap-2 tabular-nums text-brand-900">
        {value}
        {badge}
      </dd>
    </div>
  );
}

// Étapes 2 et 3 · le travail du parc, sur tablette :
//   Étalage — les billes sont étalées et mesurées une par une (longueur + Ø).
//   Billonnage — la bille n'est PAS remesurée : le bois est nettoyé puis
//   tronçonné. La bille 266 donne 266A, 266B, 266C…, chaque billon avec sa
//   propre longueur et circonférence (girth).
// La réception du bordereau se fait ailleurs (ReceptionSection, au portail).

// Deux files côte à côte plutôt qu'une liste et des filtres : au parc la
// question est « qu'est-ce qui reste à mesurer » et « qu'est-ce qui est déjà
// passé » — avec un jeu de chips, la deuxième moitié de la réponse coûtait un
// clic et faisait disparaître la première.
// Le billonnage vit dans la colonne « Étalés » : un camion à billonner EST
// étalé. Sa carte y garde son bouton, la file de billonnage ne se perd pas.
const COLUMNS = [
  {
    key: "A_ETALER",
    title: "À étaler",
    match: (t: TruckDTO) => parcStage(t) === "A_ETALER",
    empty: "Rien en attente d'étalage.",
  },
  {
    key: "ETALES",
    title: "Étalés",
    match: (t: TruckDTO) => parcStage(t) !== "A_ETALER",
    empty: "Aucune bille étalée pour l'instant.",
  },
] as const;

export default function EtalageSection({
  contractId,
  closed: closedProp = false,
  openTruckId,
  onOpened,
}: {
  contractId: string;
  /** Contrat clôturé → lecture seule (l'API refuse de toute façon). */
  closed?: boolean;
  /** Camion à ouvrir d'emblée — passé par la Réception (`?truck=…`). */
  openTruckId?: string | null;
  /** Ce camion est ouvert : l'hôte peut nettoyer l'URL / son état. */
  onOpened?: () => void;
}) {
  const can = useCan();
  // Lecture seule si le contrat est clôturé ou si le compte n'a pas la saisie.
  const closed = closedProp || !can("etalage.create");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  // Camion en cours d'étalage ou de billonnage.
  const [parcTruck, setParcTruck] = useState<TruckDTO | null>(null);
  const [parcStep, setParcStep] = useState<"ETALAGE" | "BILLONNAGE">("ETALAGE");
  const [measError, setMeasError] = useState<string | null>(null);
  const parcRef = useRef<HTMLDivElement>(null);

  const trucks = useQuery({
    queryKey: ["trucks", contractId],
    queryFn: () => trucksApi.listByContract(contractId),
  });

  const addMeasurement = useMutation({
    mutationFn: (data: MeasurementCreateInput) => trucksApi.addMeasurement(parcTruck!.id, data),
    onSuccess: (m) => {
      // Brouillon obsolète (clé partagée avec la fiche camion : truckId:context).
      if (parcTruck) clearTallyDraft(`${parcTruck.id}:${m.context}`);
      setMeasError(null);
      // Reflète le relevé sur le camion en cours → affiche le récap écarts.
      setParcTruck((prev) => (prev ? { ...prev, measurements: [...prev.measurements, m] } : prev));
      invalidateTrucks(qc, contractId);
    },
    // Sans ça l'échec est muet : « Enregistrement… » s'éteint et 275 lignes
    // semblent enregistrées alors que rien n'est parti.
    onError: (e: Error) => setMeasError(e.message),
  });

  // Camion arrivé depuis la Réception : ouvrir son panneau à l'étape qui reste.
  // Dépend de trucks.data — au retour de la réception, la liste est encore en
  // vol et le camion tout juste créé n'y est pas.
  useEffect(() => {
    if (!openTruckId || !trucks.data) return;
    const t = trucks.data.find((x) => x.id === openTruckId);
    if (!t) return;
    setParcTruck(t);
    setParcStep(diaOf(t) ? "BILLONNAGE" : "ETALAGE");
    onOpened?.();
    // onOpened hors deps : l'hôte le recrée à chaque rendu, ça relancerait
    // l'effet en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTruckId, trucks.data]);

  // Amène le panneau parc à l'écran quand il s'ouvre (tablette au parc).
  // Changement de camion ou d'étape → l'erreur du relevé précédent n'a plus lieu d'être.
  useEffect(() => {
    if (parcTruck) {
      setMeasError(null);
      // Mouvement réduit : saut direct, sans défilement animé.
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      parcRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [parcTruck, parcStep]);

  // Recherche libre (immat, B/L, parcelle) — appliquée aux deux files.
  const needle = q.trim().toLowerCase();
  const allTrucks = trucks.data ?? [];

  // Ce que les deux files ne disent pas : ce que le parc a réellement mesuré,
  // et si ça colle au bordereau. Les compteurs « à étaler / étalés » sont déjà
  // en tête de colonne, les répéter ici ne servirait à rien.
  const stats = (() => {
    const etales = allTrucks
      .map((t) => ({ t, dia: diaOf(t) }))
      .filter((x): x is { t: TruckDTO; dia: NonNullable<ReturnType<typeof diaOf>> } => !!x.dia);
    const bills = etales.reduce((n, x) => n + x.dia.logs.length, 0);
    const m3 = etales.reduce((sum, x) => sum + measurementTotalM3(x.dia), 0);
    // Écart calculé sur les SEULS camions étalés : y mêler l'annoncé de ceux
    // qui attendent encore la mesure donnerait un déficit qui ne veut rien dire.
    const declared = etales.reduce((sum, x) => sum + Number(x.t.declaredFieldM3 ?? 0), 0);
    return { bills, m3, declared, gap: declared > 0 ? m3 - declared : null };
  })();
  // Même seuil que le récap d'un camion : au-delà de 5 %, l'écart se regarde.
  const gapOff = stats.gap != null && Math.abs(stats.gap) / stats.declared > 0.05;
  // Valeur d'une tuile : fantôme en vol, « — » en erreur (QueryError plus bas).
  const kpiValue = (render: () => ReactNode): ReactNode =>
    trucks.isLoading ? (
      <SkeletonLine className="my-px h-7 w-20" />
    ) : trucks.data ? (
      render()
    ) : (
      "—"
    );

  const parcDia = parcTruck ? diaOf(parcTruck) : undefined;
  const parcGirth = parcTruck ? girthOf(parcTruck) : undefined;
  const parcDeclared = parcTruck ? declaredOf(parcTruck) : null;
  // Relevé de l'étape courante : billes (étalage, Ø) ou billons (billonnage, girth).
  const parcDone = parcStep === "ETALAGE" ? parcDia : parcGirth;

  return (
    // id : cible du raccourci « Aller à l'étalage » quand les deux postes
    // cohabitent sur une même page (onglet Parc de la fiche contrat).
    // scroll-mt : le header fixe (h-14) mangeait le haut de la section au scroll.
    <section id="etalage" className="mt-5 scroll-mt-[4.5rem]">
      {/* Chiffres du parc — bloc fantôme pendant le chargement, « — » si la
          liste a échoué : jamais un zéro qui se lirait comme « rien de mesuré ». */}
      <KpiStrip cols={3} className="mb-6">
        <Kpi bare label="Billes étalées" value={kpiValue(() => fmtInt(stats.bills))} />
        <Kpi bare label="Volume étalé" value={kpiValue(() => fmtM3(stats.m3))} />
        <Kpi
          bare
          label="Écart vs brousse"
          value={kpiValue(() =>
            stats.gap == null ? (
              // Aucun volume annoncé sur les camions étalés : il n'y a rien à
              // comparer, et « 0 » se lirait comme « compte juste ».
              "—"
            ) : (
              <span className={gapOff ? "text-amber-700" : "text-parc-700"}>
                {stats.gap >= 0 ? "+" : ""}
                {fmtM3(stats.gap)}
              </span>
            )
          )}
          // Le chiffre seul ne dit pas sur quoi porte l'écart : seuls les
          // camions étalés comptent, pas ceux qui attendent la mesure.
          hint={
            trucks.data && stats.gap != null ? `sur ${fmtM3(stats.declared)} annoncés` : undefined
          }
        />
      </KpiStrip>

      {/* Contrat ouvert mais compte sans la saisie : les boutons « Étaler »
          disparaissent, le dire plutôt que laisser chercher. Le contrat
          clôturé a déjà son bandeau (StepLayout). */}
      {!closedProp && closed && (
        <Notice icon={IconLock} className="mb-4">
          Consultation seule : votre compte n'a pas la saisie d'étalage.
        </Notice>
      )}

      {/* ── Étapes 2/3 · Étalage des billes puis billonnage ── */}
      {parcTruck && (
        // Carte blanche + anneau sève : le poste ouvert se distingue des files
        // en dessous, et l'en-tête collant de la grille (fond blanc) s'y fond.
        <div
          ref={parcRef}
          className={`${cardCls} mb-6 scroll-mt-[4.5rem] p-4 ring-1 ring-inset ring-parc-300`}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-parc-700">
                {parcStep === "ETALAGE" ? "Étape 2 · Étalage des billes" : "Étape 3 · Billonnage"}
              </p>
              <h2 className="truncate text-lg font-semibold tracking-tight text-brand-900">
                {parcTruck.registration}
              </h2>
            </div>
            <Link
              to={`/trucks/${parcTruck.id}`}
              className={`-mr-2 inline-flex min-h-touch shrink-0 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-brand-600 transition-colors hover:text-brand-900 active:bg-brand-100 ${focusCls}`}
            >
              Fiche camion
              <IconChevronRight width={16} height={16} aria-hidden />
            </Link>
          </div>

          {/* Rappel de l'annoncé — l'objectif du pointage est de le vérifier. */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {parcTruck.deliveryNote && (
              <Badge size="md" className="whitespace-nowrap">
                B/L {parcTruck.deliveryNote}
              </Badge>
            )}
            {parcTruck.parcel && (
              <Badge size="md" className="whitespace-nowrap">
                Parcelle {parcTruck.parcel}
              </Badge>
            )}
            <Badge size="md" className="whitespace-nowrap tabular-nums">
              Annoncé : {parcDeclared?.count ?? "?"} billes ·{" "}
              {parcDeclared?.m3 != null ? fmtM3(parcDeclared.m3) : "? m³"}
            </Badge>
            {/* Au billonnage, la référence n'est plus la brousse mais l'étalage :
                l'écart girth − Ø, c'est la perte au nettoyage et au tronçonnage. */}
            {parcStep === "BILLONNAGE" && parcDia && (
              <Badge size="md" tone="parc" className="whitespace-nowrap tabular-nums">
                Étalé : {parcDia.logs.length} billes · {fmtM3(measurementTotalM3(parcDia))}
              </Badge>
            )}
          </div>

          {parcStep === "BILLONNAGE" && !parcGirth && (
            <Notice className="mb-3">
              La bille n'est pas remesurée : nettoyée puis tronçonnée, elle donne ses billons
              (266 donne 266A, 266B, 266C…), chacun avec sa longueur et sa circonférence.
            </Notice>
          )}

          {parcDone ? (
            // Relevé enregistré → récap écarts, puis étape suivante.
            (() => {
              const total = measurementTotalM3(parcDone);
              const isEtalage = parcStep === "ETALAGE";
              const billes = truckBillCount(parcTruck);
              const d = parcDeclared!;
              const n = parcDone.logs.length;
              const diaM3 = parcDia ? measurementTotalM3(parcDia) : 0;
              const lossPct = diaM3 > 0 ? ((diaM3 - total) / diaM3) * 100 : null;
              return (
                <div className="rounded-lg bg-parc-50 p-3 ring-1 ring-inset ring-parc-200/80">
                  <div className="flex items-center gap-1.5 font-medium text-parc-800">
                    <IconCheck width={18} height={18} className="shrink-0" aria-hidden />
                    {isEtalage ? "Étalage enregistré" : "Billonnage enregistré"}
                  </div>
                  {/* Libellé à gauche, chiffre + verdict à droite : la même
                      lecture que le pied de saisie, le pointeur ne réapprend rien. */}
                  <dl className="mt-2 space-y-1.5 text-sm">
                    {isEtalage ? (
                      <RecapRow
                        label="Billes"
                        value={
                          <>
                            {n} étalées{d.count != null && <> / {d.count} annoncées</>}
                          </>
                        }
                        badge={
                          d.count != null && (
                            <Badge tone={n === d.count ? "parc" : "amber"} className="tabular-nums">
                              {n === d.count ? "compte bon" : `écart ${signed(n - d.count)}`}
                            </Badge>
                          )
                        }
                      />
                    ) : (
                      <RecapRow
                        label="Billons"
                        value={
                          <>
                            {n} issus de {billes ?? "?"} billes
                          </>
                        }
                      />
                    )}
                    {/* Étalage → référence brousse (quota SODEFOR).
                        Billonnage → référence étalage : l'écart est la perte
                        au nettoyage et au tronçonnage, pas un écart de quota. */}
                    <RecapRow
                      label="Volume"
                      value={
                        <>
                          {fmtM3(total)}
                          {isEtalage
                            ? d.m3 != null && d.m3 > 0 && <> / {fmtM3(d.m3)} brousse</>
                            : lossPct != null && <> / {fmtM3(diaM3)} étalés</>}
                        </>
                      }
                      badge={
                        isEtalage
                          ? d.m3 != null &&
                            d.m3 > 0 && (
                              <Badge
                                tone={Math.abs(total - d.m3) / d.m3 <= 0.05 ? "parc" : "amber"}
                                className="tabular-nums"
                              >
                                {total - d.m3 >= 0 ? "+" : ""}
                                {fmtM3(total - d.m3)}
                              </Badge>
                            )
                          : lossPct != null && (
                              <Badge tone={lossPct <= 25 ? "parc" : "amber"} className="tabular-nums">
                                perte {fmtPct(lossPct, 1)}
                              </Badge>
                            )
                      }
                    />
                  </dl>

                  {/* Le relevé enregistré remplace la saisie : sans ce rappel, on
                      ne voit plus comment ajouter une bille oubliée. */}
                  <Link
                    to={`/trucks/${parcTruck.id}`}
                    className={`-mx-2 mt-1 inline-flex min-h-touch items-center rounded-lg px-2 text-sm text-brand-600 underline transition-colors hover:text-brand-900 active:bg-parc-100 ${focusCls}`}
                  >
                    Il manque {isEtalage ? "des billes" : "des billons"} ? Compléter sur la fiche
                    camion
                  </Link>
                </div>
              );
            })()
          ) : (
            <TallyEntry
              context={parcStep === "ETALAGE" ? "YARD_DIAMETER" : "YARD_GIRTH"}
              declared={parcStep === "ETALAGE" ? (parcDeclared ?? undefined) : undefined}
              initialCount={parcStep === "ETALAGE" ? parcDeclared?.count : undefined}
              bills={parcStep === "BILLONNAGE" ? truckBillNos(parcTruck) : undefined}
              saving={addMeasurement.isPending}
              error={measError}
              draftKey={`${parcTruck.id}:${parcStep === "ETALAGE" ? "YARD_DIAMETER" : "YARD_GIRTH"}`}
              onSave={(data) => addMeasurement.mutate(data)}
            />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {parcStep === "ETALAGE" && parcDia && !parcGirth && (
              <Button variant="parc" onClick={() => setParcStep("BILLONNAGE")}>
                Billonner ce camion
                <IconArrowRight width={16} height={16} className="-mr-0.5" />
              </Button>
            )}
            {/* « Plus tard » ferme le poste sans rien perdre : la saisie en
                cours reste en brouillon sur la tablette. */}
            <Button onClick={() => setParcTruck(null)}>
              {parcDone ? "Terminer" : "Plus tard"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Deux files : ce qui attend la mesure, ce qui est déjà mesuré ── */}
      {allTrucks.length > 3 && (
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Immatriculation, B/L, parcelle…"
          aria-label="Chercher un camion"
          className="mb-3"
        />
      )}

      {trucks.isLoading && <SkeletonList count={3} lines={1} />}
      {trucks.isError && (
        <QueryError error={trucks.error} onRetry={() => trucks.refetch()}>
          Impossible de charger les camions
        </QueryError>
      )}
      {trucks.data?.length === 0 && (
        <EmptyState
          action={
            !closedProp ? (
              <Link to="/reception" className={buttonCls("primary", "md")}>
                Réceptionner un camion
              </Link>
            ) : undefined
          }
        >
          Aucun camion reçu sur ce contrat : l'étalage commence après la réception au portail.
        </EmptyState>
      )}

      {allTrucks.length > 0 && (
        // items-start : les deux files ont rarement la même longueur, elles ne
        // doivent pas s'étirer l'une sur l'autre.
        <div className="grid gap-x-4 gap-y-5 lg:grid-cols-2 lg:items-start">
          {COLUMNS.map((col) => {
            const inColumn = allTrucks.filter(col.match);
            const shown = inColumn.filter((t) => truckMatches(t, needle));
            // La file de billonnage se cache dans « Étalés » : l'annoncer en
            // tête de colonne, sinon le poste suivant passe inaperçu.
            const aBillonner = inColumn.filter((t) => parcStage(t) === "A_BILLONNER").length;
            return (
              <section key={col.key}>
                <SectionHeading
                  right={
                    col.key === "ETALES" && aBillonner > 0 ? (
                      <Badge tone="info">{aBillonner} à billonner</Badge>
                    ) : undefined
                  }
                >
                  {col.title}{" "}
                  <span className="font-normal tabular-nums text-brand-500">
                    {inColumn.length}
                  </span>
                </SectionHeading>
                <div className="space-y-2">
                  {shown.length === 0 && (
                    <EmptyState>
                      {needle !== "" ? `Aucun camion ne correspond à « ${q.trim()} ».` : col.empty}
                    </EmptyState>
                  )}
                  {shown.map((t) => {
                    const stage = parcStage(t);
                    return (
                      <TruckCard
                        key={t.id}
                        truck={t}
                        action={
                          stage !== "TERMINE" && !closed ? (
                            <Button
                              variant="parc"
                              // md (44px) et non lg : `lg` est réservé aux
                              // validations de saisie (enregistrer un relevé) ;
                              // ceci ouvre un poste, ça ne valide rien.
                              size="md"
                              // Pleine largeur tant que les files sont empilées
                              // (téléphone, tablette au parc — le pouce vise la
                              // carte entière) ; largeur naturelle dès que les
                              // deux colonnes s'affichent côte à côte.
                              className="mt-3 w-full lg:w-auto"
                              onClick={() => {
                                setParcTruck(t);
                                setParcStep(stage === "A_BILLONNER" ? "BILLONNAGE" : "ETALAGE");
                              }}
                            >
                              {stage === "A_BILLONNER" ? "Billonner" : "Étaler les billes"}
                              <IconArrowRight width={16} height={16} className="-mr-0.5" />
                            </Button>
                          ) : undefined
                        }
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
