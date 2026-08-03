import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { MeasurementCreateInput, TruckDTO } from "@ste/shared";
import { measurementTotalM3, truckBillCount, truckBillNos } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { fmtM3, fmtNum, fmtPct } from "../lib/format";
import { declaredOf, diaOf, girthOf, invalidateTrucks, parcStage, truckMatches } from "../lib/trucks";
import TallyEntry, { clearTallyDraft } from "./TallyEntry";
import TruckCard from "./TruckCard";
import Button from "./ui/Button";
import Chip from "./ui/Chip";
import { EmptyState, QueryError } from "./ui/Feedback";

// Étapes 2 et 3 · le travail du parc, sur tablette :
//   Étalage — les billes sont étalées et mesurées une par une (longueur + Ø).
//   Billonnage — la bille n'est PAS remesurée : le bois est nettoyé puis
//   tronçonné. La bille 266 donne 266A, 266B, 266C…, chaque billon avec sa
//   propre longueur et circonférence (girth).
// La réception du bordereau se fait ailleurs (ReceptionSection, au portail).

type ParcFilter = "ALL" | "A_ETALER" | "A_BILLONNER" | "TERMINES";

const FILTERS: { key: ParcFilter; label: string; match: (t: TruckDTO) => boolean }[] = [
  { key: "A_ETALER", label: "À étaler", match: (t) => parcStage(t) === "A_ETALER" },
  { key: "A_BILLONNER", label: "À billonner", match: (t) => parcStage(t) === "A_BILLONNER" },
  { key: "TERMINES", label: "Billonnés", match: (t) => parcStage(t) === "TERMINE" },
  { key: "ALL", label: "Tous", match: () => true },
];

export default function EtalageSection({
  contractId,
  closed = false,
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
  const qc = useQueryClient();
  // File d'attente par défaut : ce qui reste à étaler.
  const [filter, setFilter] = useState<ParcFilter>("A_ETALER");
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
      parcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [parcTruck, parcStep]);

  // Liste affichée : étape du parc + recherche libre (immat, B/L, parcelle).
  const needle = q.trim().toLowerCase();
  const activeFilter = FILTERS.find((f) => f.key === filter)!;
  const shownTrucks = (trucks.data ?? [])
    .filter(activeFilter.match)
    .filter((t) => truckMatches(t, needle));

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
      {/* ── Étapes 2/3 · Étalage des billes puis billonnage ── */}
      {parcTruck && (
        <div
          ref={parcRef}
          className="mb-3 scroll-mt-[4.5rem] rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"
        >
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-900">
              {parcStep === "ETALAGE" ? "Étape 2 · Étalage des billes" : "Étape 3 · Billonnage"} ·{" "}
              {parcTruck.registration}
            </div>
            <Link
              to={`/trucks/${parcTruck.id}`}
              className="text-xs text-slate-500 underline hover:text-slate-900"
            >
              Fiche complète
            </Link>
          </div>

          {/* Rappel de l'annoncé — l'objectif du pointage est de le vérifier. */}
          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
            {parcTruck.deliveryNote && (
              <span className="rounded-full bg-white px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">
                B/L {parcTruck.deliveryNote}
              </span>
            )}
            {parcTruck.parcel && (
              <span className="rounded-full bg-white px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">
                Parcelle {parcTruck.parcel}
              </span>
            )}
            <span className="rounded-full bg-white px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">
              Annoncé : {parcDeclared?.count ?? "?"} billes ·{" "}
              {parcDeclared?.m3 != null ? `${fmtNum(parcDeclared.m3.toFixed(3))} m³` : "? m³"}
            </span>
            {/* Au billonnage, la référence n'est plus la brousse mais l'étalage :
                l'écart girth − Ø, c'est la perte au nettoyage et au tronçonnage. */}
            {parcStep === "BILLONNAGE" && parcDia && (
              <span className="rounded-full bg-white px-2 py-0.5 text-slate-600 ring-1 ring-slate-200">
                Étalé : {parcDia.logs.length} billes · {fmtM3(measurementTotalM3(parcDia))}
              </span>
            )}
          </div>

          {parcStep === "BILLONNAGE" && !parcGirth && (
            <p className="mb-2 text-xs text-slate-500">
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
                <div className="rounded-lg bg-white p-3 text-sm ring-1 ring-emerald-200">
                  <div className="font-medium text-emerald-700">
                    {isEtalage ? "Étalage enregistré ✓" : "Billonnage enregistré ✓"}
                  </div>
                  <div className="mt-1 space-y-0.5 text-slate-600">
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
                                ? "text-emerald-700"
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
                              / {fmtNum(d.m3.toFixed(3))} m³ brousse{" "}
                              <span
                                className={
                                  Math.abs(total - d.m3) / d.m3 <= 0.05
                                    ? "text-emerald-700"
                                    : "text-amber-700"
                                }
                              >
                                ({total - d.m3 >= 0 ? "+" : ""}
                                {fmtNum((total - d.m3).toFixed(3))} m³)
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
                                / {fmtNum(dia.toFixed(3))} m³ étalés{" "}
                                <span
                                  className={
                                    lossPct <= 25 ? "text-emerald-700" : "text-amber-700"
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
                    className="mt-2 inline-block text-xs text-slate-500 underline hover:text-slate-900"
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
              bills={parcStep === "BILLONNAGE" ? truckBillNos(parcTruck) : undefined}
              saving={addMeasurement.isPending}
              error={measError}
              draftKey={`${parcTruck.id}:${parcStep === "ETALAGE" ? "YARD_DIAMETER" : "YARD_GIRTH"}`}
              onSave={(data) => addMeasurement.mutate(data)}
            />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {parcStep === "ETALAGE" && parcDia && !parcGirth && (
              <Button variant="emerald" onClick={() => setParcStep("BILLONNAGE")}>
                Billonner (266 → 266A, 266B…) →
              </Button>
            )}
            <Button size="xs" onClick={() => setParcTruck(null)}>
              {parcDone ? "Terminer" : "Plus tard"}
            </Button>
          </div>
        </div>
      )}

      {/* ── File d'attente du parc : filtres par étape + recherche ── */}
      <div className="mb-2 space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          File du parc
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const n = (trucks.data ?? []).filter(f.match).length;
            return (
              <Chip key={f.key} selected={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label} ({n})
              </Chip>
            );
          })}
        </div>
        {(trucks.data?.length ?? 0) > 3 && (
          <div className="relative">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Immatriculation, B/L, parcelle…"
              aria-label="Chercher un camion"
              className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-9 text-base outline-none focus:border-slate-900"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Effacer la recherche"
                className="absolute inset-y-0 right-0 px-3 text-lg text-slate-400 hover:text-slate-900 active:text-slate-900"
              >
                ×
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Cartes camions : annoncé vs étalé/billonné en un coup d'œil ── */}
      <div className="space-y-2">
        {trucks.isLoading && <p className="text-sm text-slate-500">Chargement…</p>}
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
        {(trucks.data?.length ?? 0) > 0 && shownTrucks.length === 0 && (
          <EmptyState>
            {needle !== ""
              ? "Aucun camion ne correspond."
              : `Rien dans « ${activeFilter.label} » — voir « Tous ».`}
          </EmptyState>
        )}
        {shownTrucks.map((t) => {
          const stage = parcStage(t);
          return (
            <TruckCard
              key={t.id}
              truck={t}
              action={
                stage !== "TERMINE" && !closed ? (
                  <Button
                    variant="emerald"
                    size="lg"
                    className="mt-3 w-full"
                    onClick={() => {
                      setParcTruck(t);
                      setParcStep(stage === "A_BILLONNER" ? "BILLONNAGE" : "ETALAGE");
                    }}
                  >
                    {stage === "A_BILLONNER"
                      ? "Billonner (266 → 266A, 266B…) →"
                      : "Étaler les billes →"}
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
}
