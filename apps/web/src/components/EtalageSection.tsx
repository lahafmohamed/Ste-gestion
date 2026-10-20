import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { MeasurementCreateInput, TruckDTO } from "@ste/shared";
import { measurementTotalM3, truckBillCount, truckBillNos } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { useCan } from "../lib/auth";
import { fmtInt, fmtM3, fmtNum, fmtPct } from "../lib/format";
import { declaredOf, diaOf, girthOf, invalidateTrucks, parcStage, truckMatches } from "../lib/trucks";
import TallyEntry from "./TallyEntry";
import { clearTallyDraft } from "../lib/tallyDraft";
import TruckCard from "./TruckCard";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { Kpi, KpiStrip, SectionHeading } from "./ui/Card";
import { EmptyState, QueryError } from "./ui/Feedback";
import { SearchInput } from "./ui/Input";
import { SkeletonList } from "./ui/Skeleton";
import { IconArrowRight, IconCheck } from "./icons";

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
      {/* Chiffres du parc — « … » tant que la liste n'est pas là, jamais un
          zéro qui se lirait comme « rien de mesuré ». */}
      <KpiStrip cols={3} className="mb-6">
        <Kpi bare label="Billes étalées" value={trucks.data ? fmtInt(stats.bills) : "…"} />
        <Kpi bare label="Volume étalé" value={trucks.data ? fmtM3(stats.m3.toFixed(3)) : "…"} />
        <Kpi
          bare
          label="Écart vs brousse"
          value={
            !trucks.data ? (
              "…"
            ) : stats.gap == null ? (
              // Aucun volume annoncé sur les camions étalés : il n'y a rien à
              // comparer, et « 0 » se lirait comme « compte juste ».
              "—"
            ) : (
              <span className={gapOff ? "text-amber-700" : "text-parc-700"}>
                {stats.gap >= 0 ? "+" : ""}
                {fmtM3(stats.gap)}
              </span>
            )
          }
        />
      </KpiStrip>

      {/* ── Étapes 2/3 · Étalage des billes puis billonnage ── */}
      {parcTruck && (
        <div
          ref={parcRef}
          className="mb-3 scroll-mt-[4.5rem] rounded-xl border border-parc-200 bg-parc-50/40 p-4"
        >
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-medium text-brand-900">
              {parcStep === "ETALAGE" ? "Étape 2 · Étalage des billes" : "Étape 3 · Billonnage"} ·{" "}
              {parcTruck.registration}
            </div>
            <Link
              to={`/trucks/${parcTruck.id}`}
              className="inline-flex min-h-touch items-center rounded-lg px-2 text-sm text-brand-500 underline hover:text-brand-900 active:bg-brand-100"
            >
              Fiche complète
            </Link>
          </div>

          {/* Rappel de l'annoncé — l'objectif du pointage est de le vérifier. */}
          <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
            {parcTruck.deliveryNote && (
              <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-brand-700 ring-1 ring-brand-200">
                B/L {parcTruck.deliveryNote}
              </span>
            )}
            {parcTruck.parcel && (
              <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-brand-700 ring-1 ring-brand-200">
                Parcelle {parcTruck.parcel}
              </span>
            )}
            <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-brand-700 ring-1 ring-brand-200">
              Annoncé : {parcDeclared?.count ?? "?"} billes ·{" "}
              {parcDeclared?.m3 != null ? fmtM3(parcDeclared.m3) : "? m³"}
            </span>
            {/* Au billonnage, la référence n'est plus la brousse mais l'étalage :
                l'écart girth − Ø, c'est la perte au nettoyage et au tronçonnage. */}
            {parcStep === "BILLONNAGE" && parcDia && (
              <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-brand-700 ring-1 ring-brand-200">
                Étalé : {parcDia.logs.length} billes · {fmtM3(measurementTotalM3(parcDia))}
              </span>
            )}
          </div>

          {parcStep === "BILLONNAGE" && !parcGirth && (
            <p className="mb-2 text-xs text-brand-500">
              Les billes ne sont pas remesurées : le bois est nettoyé puis tronçonné. Taper une
              bille crée son billon suivant (266 → 266A, 266B, 266C…), chacun avec sa propre
              longueur et circonférence.
            </p>
          )}

          {parcDone ? (
            // Relevé enregistré → récap écarts, puis étape suivante.
            (() => {
              const total = measurementTotalM3(parcDone);
              const isEtalage = parcStep === "ETALAGE";
              const billes = truckBillCount(parcTruck);
              const d = parcDeclared!;
              return (
                <div className="rounded-lg bg-white p-3 text-sm ring-1 ring-parc-200">
                  <div className="flex items-center gap-1.5 font-medium text-parc-700">
                    <IconCheck width={16} height={16} className="shrink-0" aria-hidden />
                    {isEtalage ? "Étalage enregistré" : "Billonnage enregistré"}
                  </div>
                  <div className="mt-1 space-y-0.5 text-brand-600">
                    <div>
                      {isEtalage ? (
                        <>
                          Billes : <span className="tabular-nums">{parcDone.logs.length}</span>{" "}
                          étalées
                        </>
                      ) : (
                        <>
                          Billons : <span className="tabular-nums">{parcDone.logs.length}</span> issus
                          de <span className="tabular-nums">{billes ?? "?"}</span> billes
                        </>
                      )}
                      {isEtalage && d.count != null && (
                        <>
                          {" "}
                          / {d.count} annoncées{" "}
                          <span
                            className={
                              parcDone.logs.length === d.count
                                ? "text-parc-700"
                                : "text-amber-700"
                            }
                          >
                            (
                            {parcDone.logs.length === d.count
                              ? "compte bon"
                              : `écart ${parcDone.logs.length - d.count > 0 ? "+" : ""}${parcDone.logs.length - d.count}`}
                            )
                          </span>
                        </>
                      )}
                    </div>
                    <div>
                      Volume : <span className="tabular-nums">{fmtM3(total)}</span>
                      {/* Étalage → référence brousse (quota SODEFOR).
                          Billonnage → référence étalage : l'écart est la perte
                          au nettoyage et au tronçonnage, pas un écart de quota. */}
                      {isEtalage
                        ? d.m3 != null &&
                          d.m3 > 0 && (
                            <>
                              {" "}
                              / {fmtM3(d.m3)} brousse{" "}
                              <span
                                className={
                                  Math.abs(total - d.m3) / d.m3 <= 0.05
                                    ? "text-parc-700"
                                    : "text-amber-700"
                                }
                              >
                                ({total - d.m3 >= 0 ? "+" : ""}
                                {fmtM3(total - d.m3)})
                              </span>
                            </>
                          )
                        : parcDia &&
                          (() => {
                            const dia = measurementTotalM3(parcDia);
                            if (!(dia > 0)) return null;
                            const lossPct = ((dia - total) / dia) * 100;
                            return (
                              <>
                                {" "}
                                / {fmtM3(dia)} étalés{" "}
                                <span
                                  className={
                                    lossPct <= 25 ? "text-parc-700" : "text-amber-700"
                                  }
                                >
                                  (perte {fmtPct(lossPct, 1)})
                                </span>
                              </>
                            );
                          })()}
                    </div>
                  </div>

                  {/* Le relevé enregistré remplace la saisie : sans ce rappel, on
                      ne voit plus comment ajouter une bille oubliée. */}
                  <Link
                    to={`/trucks/${parcTruck.id}`}
                    className="mt-2 inline-block text-xs text-brand-500 underline hover:text-brand-900"
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
            <Button size="xs" onClick={() => setParcTruck(null)}>
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
        <EmptyState>
          Aucun camion.{" "}
          <Link to="/reception" className="underline">
            Réceptionner
          </Link>{" "}
          un camion d'abord.
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
                  {col.title} ({inColumn.length})
                </SectionHeading>
                <div className="space-y-2">
                  {shown.length === 0 && (
                    <EmptyState>
                      {needle !== "" ? "Aucun camion ne correspond." : col.empty}
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
