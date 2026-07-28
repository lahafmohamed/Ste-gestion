import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { MeasurementCreateInput, TruckDTO } from "@ste/shared";
import { measurementTotalM3, truckBillCount, truckBillNos } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { fmtM3, fmtNum, fmtPct, normalizeDecimal } from "../lib/format";
import TallyEntry, { clearTallyDraft } from "./TallyEntry";

// Flux en 3 étapes (chronologie réelle du parc) :
// 1. Réception — le camion arrive : immat, B/L, parcelle, origine, vol brousse
//    et nombre de billes annoncés (recopiés du bordereau SODEFOR).
// 2. Étalage — les billes sont étalées et mesurées une par une (n° 266, 267…,
//    longueur + Ø), volume auto L×Ø²×0,00007854, écarts live vs l'annoncé.
// 3. Billonnage — la bille n'est PAS remesurée : on nettoie le bois puis on le
//    tronçonne. La bille 266 donne les billons 266A, 266B, 266C… et c'est chaque
//    billon qui reçoit sa propre mesure (longueur + circonférence = girth).
// La brousse détaillée reste sur la fiche camion.

function diaOf(t: TruckDTO) {
  return t.measurements.find((m) => m.context === "YARD_DIAMETER");
}

function girthOf(t: TruckDTO) {
  return t.measurements.find((m) => m.context === "YARD_GIRTH");
}

function declaredOf(t: TruckDTO) {
  return {
    count: t.declaredLogCount ?? null,
    m3: t.declaredFieldM3 != null ? Number(t.declaredFieldM3) : null,
  };
}

// Date locale YYYY-MM-DD (input type=date).
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ParcFilter = "ALL" | "A_ETALER" | "A_BILLONNER" | "TERMINES";

export default function TrucksSection({
  contractId,
  closed = false,
}: {
  contractId: string;
  /** Contrat clôturé → lecture seule (l'API refuse de toute façon). */
  closed?: boolean;
}) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<ParcFilter>("ALL");
  const [q, setQ] = useState("");
  const [v, setV] = useState({
    registration: "",
    deliveryNote: "",
    parcel: "",
    origin: "",
    declaredFieldM3: "",
    declaredLogCount: "",
    arrivedAt: todayISO(),
  });
  const [error, setError] = useState<string | null>(null);
  // Étapes 2/3 : camion en cours d'étalage ou de billonnage (enchaîné après
  // réception, ou repris depuis une carte).
  const [parcTruck, setParcTruck] = useState<TruckDTO | null>(null);
  const [parcStep, setParcStep] = useState<"ETALAGE" | "BILLONNAGE">("ETALAGE");
  const [measError, setMeasError] = useState<string | null>(null);
  // « Enregistrer et camion suivant » : le bouton cliqué décide de la suite.
  // Ref et non state — lu dans onSuccess, juste après le clic.
  const chainRef = useRef(false);
  const [justReceived, setJustReceived] = useState<TruckDTO | null>(null);
  const parcRef = useRef<HTMLDivElement>(null);
  const regRef = useRef<HTMLInputElement>(null);

  const trucks = useQuery({
    queryKey: ["trucks", contractId],
    queryFn: () => trucksApi.listByContract(contractId),
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["trucks", contractId] });
    qc.invalidateQueries({ queryKey: ["truck-stats", contractId] });
    qc.invalidateQueries({ queryKey: ["summary", contractId] });
    qc.invalidateQueries({ queryKey: ["suggestions", contractId] });
    // Cartes de la page Contrats (brousse, camions estimés) — dérivées des camions.
    qc.invalidateQueries({ queryKey: ["contracts", "overview"] });
  }

  const create = useMutation({
    mutationFn: (data: Parameters<typeof trucksApi.create>[0]) => trucksApi.create(data),
    onSuccess: (t) => {
      setV({
        registration: "",
        deliveryNote: "",
        parcel: "",
        origin: "",
        declaredFieldM3: "",
        declaredLogCount: "",
        arrivedAt: todayISO(),
      });
      setError(null);
      if (chainRef.current) {
        // Les camions arrivent en file au portail : enchaîner les bordereaux et
        // étaler plus tard, quand le bois est descendu.
        setJustReceived(t);
        setShowForm(true);
      } else {
        setJustReceived(null);
        setShowForm(false);
        setParcTruck(t); // étape 2 enchaînée directement
        setParcStep("ETALAGE");
      }
      invalidateAll();
    },
    onError: (e: Error) => setError(e.message),
  });

  const addMeasurement = useMutation({
    mutationFn: (data: MeasurementCreateInput) => trucksApi.addMeasurement(parcTruck!.id, data),
    onSuccess: (m) => {
      // Brouillon obsolète (clé partagée avec la fiche camion : truckId:context).
      if (parcTruck) clearTallyDraft(`${parcTruck.id}:${m.context}`);
      setMeasError(null);
      // Reflète le relevé sur le camion en cours → affiche le récap écarts.
      setParcTruck((prev) => (prev ? { ...prev, measurements: [...prev.measurements, m] } : prev));
      invalidateAll();
    },
    // Sans ça l'échec est muet : « Enregistrement… » s'éteint et 275 lignes
    // semblent enregistrées alors que rien n'est parti.
    onError: (e: Error) => setMeasError(e.message),
  });

  // Bordereau suivant : le curseur repart sur l'immatriculation, pas au doigt.
  useEffect(() => {
    if (justReceived) regRef.current?.focus();
  }, [justReceived]);

  // Amène le panneau parc à l'écran quand il s'ouvre (tablette au parc).
  // Changement de camion ou d'étape → l'erreur du relevé précédent n'a plus lieu d'être.
  useEffect(() => {
    if (parcTruck) {
      setMeasError(null);
      parcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [parcTruck, parcStep]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      contractId,
      registration: v.registration.trim(),
      deliveryNote: v.deliveryNote.trim() || undefined,
      parcel: v.parcel.trim() || undefined,
      origin: v.origin.trim() || undefined,
      declaredFieldM3: v.declaredFieldM3.trim() || undefined,
      declaredLogCount: v.declaredLogCount.trim() ? Number(v.declaredLogCount) : undefined,
      // Midi local : la date seule ne doit pas glisser d'un jour en UTC.
      arrivedAt: v.arrivedAt ? new Date(`${v.arrivedAt}T12:00:00`) : undefined,
    });
  }

  // B/L déjà saisi sur ce contrat ? Warn non bloquant : un camion physique
  // revient plusieurs fois, mais chaque voyage a son propre bordereau — un
  // doublon est presque toujours une faute de frappe.
  const blDup =
    v.deliveryNote.trim() !== ""
      ? trucks.data?.find((t) => t.deliveryNote === v.deliveryNote.trim())
      : undefined;

  // Liste affichée : étape du parc + recherche libre (immat, B/L, parcelle).
  // Passé 40 camions, retrouver « 3201 GS 01 » au scroll n'est plus tenable.
  const needle = q.trim().toLowerCase();
  const shownTrucks = (trucks.data ?? [])
    .filter((t) => {
      if (filter === "A_ETALER") return !diaOf(t) && !girthOf(t);
      if (filter === "A_BILLONNER") return !!diaOf(t) && !girthOf(t);
      if (filter === "TERMINES") return !!girthOf(t);
      return true;
    })
    .filter((t) =>
      needle === ""
        ? true
        : [t.registration, t.deliveryNote, t.parcel, t.origin]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle)
    );

  const parcDia = parcTruck ? diaOf(parcTruck) : undefined;
  const parcGirth = parcTruck ? girthOf(parcTruck) : undefined;
  const parcDeclared = parcTruck ? declaredOf(parcTruck) : null;
  // Relevé de l'étape courante : billes (étalage, Ø) ou billons (billonnage, girth).
  const parcDone = parcStep === "ETALAGE" ? parcDia : parcGirth;

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Camions ({trucks.data?.length ?? 0})
        </h2>
        {!closed && (
          <button
            onClick={() => {
              setJustReceived(null);
              setShowForm((s) => !s);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-900"
          >
            {showForm ? "Fermer" : "+ Camion arrivé"}
          </button>
        )}
      </div>

      {/* ── Étape 1 · Réception : uniquement l'en-tête recopié du bordereau ── */}
      {showForm && (
        <form onSubmit={submit} className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-medium text-slate-900">
            Étape 1 · Réception du camion
          </div>

          {/* Bordereau précédent enregistré : de quoi vérifier et enchaîner. */}
          {justReceived && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <span>
                {justReceived.registration} réceptionné ✓
                {justReceived.deliveryNote ? ` · B/L ${justReceived.deliveryNote}` : ""}
              </span>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setJustReceived(null);
                  setParcTruck(justReceived);
                  setParcStep("ETALAGE");
                }}
                className="font-medium underline hover:text-emerald-900"
              >
                Étaler ses billes
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["registration", "Immatriculation", "3201 GS 01", true],
                ["deliveryNote", "B/L", "176530", false],
                ["parcel", "Parcelle origine", "146-99/04", false],
                ["origin", "Origine", "SANGOUE", false],
                ["declaredFieldM3", "Vol brousse (m³)", "33.171", false],
                ["declaredLogCount", "Nombre de billes", "58", false],
                ["arrivedAt", "Arrivé le", "", false],
              ] as const
            ).map(([key, label, ph, required]) => {
              // Champs chiffrés : la virgule du clavier FR doit devenir un point,
              // sinon « 33,171 » part tel quel et l'API refuse la ligne.
              const isNum = key === "declaredFieldM3" || key === "declaredLogCount";
              return (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600">{label}</span>
                  <input
                    ref={key === "registration" ? regRef : undefined}
                    required={required}
                    type={key === "arrivedAt" ? "date" : "text"}
                    // Un camion n'arrive pas dans le futur — évite le 2026 → 2062.
                    max={key === "arrivedAt" ? todayISO() : undefined}
                    inputMode={isNum ? "decimal" : undefined}
                    value={v[key]}
                    onChange={(e) =>
                      setV((p) => ({
                        ...p,
                        [key]: isNum ? normalizeDecimal(e.target.value) : e.target.value,
                      }))
                    }
                    placeholder={ph}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900"
                  />
                </label>
              );
            })}
          </div>

          {/* B/L déjà vu sur ce contrat → probable faute de frappe (non bloquant). */}
          {blDup && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠ B/L {blDup.deliveryNote} déjà saisi sur ce contrat (camion {blDup.registration},
              arrivé le {new Date(blDup.arrivedAt).toLocaleDateString("fr-FR")}). Vérifier le
              bordereau avant de continuer.
            </p>
          )}

          <div className="mt-3 border-t border-slate-100 pt-3">
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            {/* Les deux boutons sont des submit : la validation native du champ
                Immatriculation joue dans les deux cas, et le clic pose chainRef
                avant que le submit ne parte. Le principal est premier dans le DOM
                (Entrée au clavier déclenche le premier submit) et replacé à
                droite via `order`. */}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="submit"
                onClick={() => (chainRef.current = false)}
                disabled={create.isPending}
                className="order-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {create.isPending ? "Enregistrement…" : "Réceptionner → étaler les billes"}
              </button>
              <button
                type="submit"
                onClick={() => (chainRef.current = true)}
                disabled={create.isPending}
                className="order-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:border-slate-900 disabled:opacity-50"
              >
                Enregistrer et camion suivant
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Étapes 2/3 · Étalage des billes puis billonnage (enchaînés après réception) ── */}
      {parcTruck && (
        <div
          ref={parcRef}
          className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"
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
              <button
                onClick={() => setParcStep("BILLONNAGE")}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Billonner (266 → 266A, 266B…) →
              </button>
            )}
            <button
              onClick={() => setParcTruck(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:border-slate-900"
            >
              {parcDone ? "Terminer" : "Plus tard"}
            </button>
          </div>
        </div>
      )}

      {/* ── Recherche + filtres par étape du parc — dès que la liste s'allonge ── */}
      {(trucks.data?.length ?? 0) > 3 && (
        <div className="mb-2 space-y-2">
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
              className="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-900"
            >
              ×
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {(
            [
              ["ALL", "Tous", (t: TruckDTO) => true],
              ["A_ETALER", "À étaler", (t: TruckDTO) => !diaOf(t) && !girthOf(t)],
              ["A_BILLONNER", "À billonner", (t: TruckDTO) => !!diaOf(t) && !girthOf(t)],
              ["TERMINES", "Billonnés", (t: TruckDTO) => !!girthOf(t)],
            ] as const
          ).map(([key, label, pred]) => {
            const n = (trucks.data ?? []).filter(pred).length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-full px-2.5 py-1 ${
                  filter === key
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400"
                }`}
              >
                {label} ({n})
              </button>
            );
          })}
        </div>
        </div>
      )}

      {/* ── Cartes camions : annoncé vs étalé/billonné en un coup d'œil ── */}
      <div className="space-y-2">
        {trucks.data?.length === 0 && !showForm && !parcTruck && (
          <p className="text-sm text-slate-500">Aucun camion.</p>
        )}
        {(trucks.data?.length ?? 0) > 0 && shownTrucks.length === 0 && (
          <p className="text-sm text-slate-500">Aucun camion ne correspond.</p>
        )}
        {shownTrucks.map((t) => {
          const dia = diaOf(t);
          const girth = girthOf(t);
          const d = declaredOf(t);
          // Volume parc de référence = étalage des billes (Ø) ; à défaut le girth.
          const measured = dia ?? girth;
          const total = measured ? measurementTotalM3(measured) : null;
          // Billes réelles : le girth compte des billons, regroupés par bille mère.
          const count = truckBillCount(t);
          const countGap = d.count != null && count != null ? count - d.count : null;
          const volGap = d.m3 != null && d.m3 > 0 && total != null ? total - d.m3 : null;
          return (
            <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <Link to={`/trucks/${t.id}`} className="block hover:opacity-80">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{t.registration}</span>
                    {!dia && !girth && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        À étaler
                      </span>
                    )}
                    {dia && !girth && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        À billonner
                      </span>
                    )}
                  </div>
                  <div className="shrink-0 text-xs text-slate-500">
                    {t.deliveryNote ? `B/L ${t.deliveryNote}` : ""}
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-xs">
                  <div className="text-slate-500">
                    Annoncé : {d.count ?? "—"} billes ·{" "}
                    {d.m3 != null ? `${fmtNum(d.m3.toFixed(3))} m³` : "— m³"}
                    {t.parcel ? ` · parcelle ${t.parcel}` : ""}
                  </div>
                  {measured && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-700">
                        Étalé : {count} billes · {fmtM3(total!)}
                        {girth && ` → ${girth.logs.length} billons`}
                      </span>
                      {countGap != null && (
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            countGap === 0
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {countGap === 0 ? "compte bon ✓" : `billes ${countGap > 0 ? "+" : ""}${countGap}`}
                        </span>
                      )}
                      {volGap != null && (
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium tabular-nums ${
                            Math.abs(volGap) / d.m3! <= 0.05
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          vol {volGap >= 0 ? "+" : ""}
                          {fmtNum(volGap.toFixed(3))} m³
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>

              {!girth && !closed && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setParcTruck(t);
                    setParcStep(dia ? "BILLONNAGE" : "ETALAGE");
                  }}
                  className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  {dia ? "Billonner (266 → 266A, 266B…) →" : "Étaler les billes →"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
