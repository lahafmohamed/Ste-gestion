import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { MeasurementContext, MeasurementDTO } from "@ste/shared";
import {
  MEASUREMENT_CONTEXT_LABELS,
  billParent,
  measurementTotalM3,
  truckBillCount,
  truckBillNos,
  type MeasurementCreateInput,
} from "@ste/shared";
import { downloadFile, trucksApi } from "../lib/api";
import { fmtM3, fmtNum } from "../lib/format";
import TallyEntry, { clearTallyDraft } from "../components/TallyEntry";
import TruckBordereau from "../components/TruckBordereau";
import PackingList from "../components/PackingList";
import TruckDebitageSection from "../components/TruckDebitageSection";
import Badge, { type BadgeTone } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import { FormError } from "../components/ui/Feedback";

const CONTEXTS: MeasurementContext[] = ["FIELD", "YARD_GIRTH", "YARD_DIAMETER"];

// Regroupe les billons d'un relevé girth par bille mère (traçabilité bille→billon).
function groupByBill(m: MeasurementDTO) {
  const groups = new Map<string, { billons: number; m3: number }>();
  for (const l of m.logs) {
    const key = billParent(l.externalId) ?? "?";
    const g = groups.get(key) ?? { billons: 0, m3: 0 };
    g.billons += 1;
    g.m3 += Number(l.volumeM3);
    groups.set(key, g);
  }
  return [...groups.entries()].map(([bill, g]) => ({ bill, ...g }));
}

function MeasurementTable({
  m,
  onDelete,
  onAppend,
  appending = false,
  billNos,
  appendDraftKey,
  appendError,
}: {
  m: MeasurementDTO;
  onDelete: () => void;
  onAppend?: (data: MeasurementCreateInput) => void;
  appending?: boolean;
  /** Girth : n° des billes étalées → sélecteur de billon (266 → 266A, 266B…). */
  billNos?: string[];
  /** Brouillon localStorage du mode « continuer l'étalage ». */
  appendDraftKey?: string;
  /** Échec du dernier ajout — la saisie reste ouverte pour réessayer. */
  appendError?: string | null;
}) {
  const isDia = m.context === "YARD_DIAMETER";
  const [byBill, setByBill] = useState(false);
  const [adding, setAdding] = useState(false);

  // Le panneau d'ajout se referme quand le relevé revient agrandi (succès), pas
  // au clic : sinon un échec ferait disparaître la saisie sans rien dire.
  const logCount = m.logs.length;
  const prevLogCount = useRef(logCount);
  useEffect(() => {
    if (logCount > prevLogCount.current) setAdding(false);
    prevLogCount.current = logCount;
  }, [logCount]);
  // Traçabilité : proposer la vue par bille si des billons sont suffixés (283A/283B).
  const hasBillons =
    m.context === "YARD_GIRTH" &&
    m.logs.some((l) => l.externalId && /[A-Za-z]$/.test(l.externalId));
  const bills = hasBillons ? groupByBill(m) : [];

  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="py-1 font-normal">#</th>
            <th className="py-1 font-normal">N° log</th>
            <th className="py-1 font-normal">L (m)</th>
            <th className="py-1 font-normal">{isDia ? "Ø (cm)" : "Circ (cm)"}</th>
            <th className="py-1 text-right font-normal">m³</th>
            {isDia && <th className="py-1 text-right font-normal">CFT</th>}
          </tr>
        </thead>
        <tbody>
          {m.logs.map((l) => (
            <tr key={l.id} className="border-t border-slate-100">
              <td className="py-1 text-slate-400">{l.position}</td>
              <td className="py-1">{l.externalId ?? "—"}</td>
              <td className="py-1 tabular-nums">
                {fmtNum(isDia ? (l.lengthFt ?? 0) : (l.lengthM ?? 0))}
              </td>
              <td className="py-1 tabular-nums">
                {fmtNum(isDia ? (l.diameterIn ?? 0) : (l.circumferenceCm ?? 0))}
              </td>
              <td className="py-1 text-right tabular-nums">{fmtNum(l.volumeM3)}</td>
              {isDia && (
                <td className="py-1 text-right tabular-nums">{fmtNum(l.cft ?? 0)}</td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <td colSpan={4} className="py-1.5">
              Total ({m.logs.length} {m.context === "YARD_GIRTH" ? "billons" : "billes"}
              {hasBillons && ` · ${bills.length} billes`})
            </td>
            <td className="py-1.5 text-right tabular-nums">
              {fmtNum(measurementTotalM3(m).toFixed(6))}
            </td>
            {isDia && <td />}
          </tr>
          {m.logs.length > 1 &&
            (() => {
              const vols = m.logs.map((l) => Number(l.volumeM3));
              const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
              return (
                <tr className="text-xs text-slate-500">
                  <td colSpan={4} className="py-1">
                    Moy {fmtNum(avg.toFixed(4))} · Max {fmtNum(Math.max(...vols).toFixed(4))} ·
                    Min {fmtNum(Math.min(...vols).toFixed(4))}
                  </td>
                  <td />
                  {isDia && <td />}
                </tr>
              );
            })()}
        </tfoot>
      </table>
      </div>

      {byBill && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <div className="mb-1 text-xs font-medium text-slate-500">
            Par bille mère ({bills.length} billes → {m.logs.length} billons)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {bills.map((b) => (
              <Badge key={b.bill} title={`${fmtNum(b.m3.toFixed(4))} m³`}>
                {b.bill} · {b.billons}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onAppend && !adding && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            + Continuer l'étalage
          </Button>
        )}
        <button onClick={onDelete} className="text-xs text-slate-400 hover:text-red-600">
          Supprimer cet étalage
        </button>
        {hasBillons && (
          <button
            onClick={() => setByBill((s) => !s)}
            className="text-xs text-slate-500 hover:text-slate-900"
          >
            {byBill ? "Masquer la vue par bille" : "Vue par bille"}
          </button>
        )}
      </div>

      {adding && onAppend && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-medium text-slate-500">
            Ajouter des {m.context === "YARD_GIRTH" ? "billons" : "billes"} (à partir du n°{" "}
            {m.logs.length + 1})
          </div>
          <TallyEntry
            context={m.context}
            saving={appending}
            bills={billNos}
            existingIds={m.logs.map((l) => l.externalId ?? "")}
            draftKey={appendDraftKey}
            error={appendError}
            onSave={(data) => onAppend(data)}
          />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-2 text-xs text-slate-400 hover:text-slate-700"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

export default function TruckDetailPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["trucks", "detail", id], queryFn: () => trucksApi.get(id) });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["trucks"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["suggestions"] });
  }

  // Échec d'un relevé : sans retour visible, « Enregistrement… » s'éteint et la
  // saisie paraît enregistrée. On mémorise quelle saisie a échoué (contexte, et
  // ajout ou non) pour afficher le message contre le bon bouton Valider.
  const [measError, setMeasError] = useState<{ key: string; message: string } | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const addMeasurement = useMutation({
    mutationFn: (data: MeasurementCreateInput) => trucksApi.addMeasurement(id, data),
    onSuccess: (_m, vars) => {
      clearTallyDraft(`${id}:${vars.context}`);
      setMeasError(null);
      refresh();
    },
    onError: (e: Error, vars) => setMeasError({ key: vars.context, message: e.message }),
  });

  const appendMeasurement = useMutation({
    mutationFn: ({
      measurementId,
      data,
    }: {
      measurementId: string;
      data: MeasurementCreateInput;
    }) => trucksApi.appendMeasurement(measurementId, data),
    onSuccess: (_m, vars) => {
      clearTallyDraft(`${id}:${vars.data.context}:append`);
      setMeasError(null);
      refresh();
    },
    onError: (e: Error, vars) =>
      setMeasError({ key: `${vars.data.context}:append`, message: e.message }),
  });

  const delMeasurement = useMutation({
    mutationFn: trucksApi.removeMeasurement,
    onSuccess: () => {
      setOpError(null);
      refresh();
    },
    onError: (e: Error) => setOpError(e.message),
  });

  // Prérempli l'étalage Ø avec les n° de billes de la packing list (mesures à saisir).
  const [diaPrefill, setDiaPrefill] = useState<string[] | null>(null);

  const confirmGap = useMutation({
    mutationFn: (v: boolean) => trucksApi.update(id, { countGapConfirmed: v }),
    onSuccess: () => {
      setOpError(null);
      refresh();
    },
    onError: (e: Error) => setOpError(e.message),
  });

  const delTruck = useMutation({
    mutationFn: () => trucksApi.remove(id),
    onSuccess: () => {
      refresh();
      nav(-1);
    },
    onError: (e: Error) => setOpError(e.message),
  });

  function confirmDelTruck() {
    const t = q.data;
    if (!t) return;
    const n = t.measurements.reduce((s, m) => s + m.logs.length, 0);
    if (
      window.confirm(
        `Supprimer le camion ${t.registration} ?\n` +
          `${n} mesure${n > 1 ? "s" : ""} et sa packing list seront effacées. Action irréversible.`
      )
    ) {
      delTruck.mutate();
    }
  }

  if (q.isLoading) return <p className="p-6 text-sm text-slate-500">Chargement…</p>;
  if (q.isError || !q.data)
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">Camion introuvable.</p>
        <Link to="/contracts" className="text-sm text-slate-500 underline">
          ← Contrats
        </Link>
      </div>
    );

  const t = q.data;

  // Écart de comptage : billes annoncées (bordereau) vs billes étalées au parc.
  // Le girth compte des BILLONS (266A, 266B… issus du tronçonnage d'une seule
  // bille) — il est donc regroupé par bille mère avant comparaison.
  const billesOnParc = truckBillCount(t);
  const billNos = truckBillNos(t);
  const billonCount = t.measurements.find((m) => m.context === "YARD_GIRTH")?.logs.length ?? null;
  const declaredCount = t.declaredLogCount;
  const countGap =
    declaredCount != null && billesOnParc != null ? billesOnParc - declaredCount : null;

  // Étape atteinte dans la chaîne réception → étalage → billonnage → débitage.
  const stage: { label: string; tone: BadgeTone } = t.sawn
    ? { label: "Scié", tone: "sky" }
    : billonCount != null
      ? { label: "Billonné · sur parc", tone: "emerald" }
      : t.measurements.some((m) => m.context === "YARD_DIAMETER")
        ? { label: "Étalé · à billonner", tone: "sky" }
        : { label: "À étaler", tone: "amber" };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to={`/contracts/${t.contractId}`} className="text-sm text-slate-500">
        ← Contrat
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-slate-900">
            {t.registration}
            {/* Où en est le camion dans la chaîne — visible sans dérouler la page. */}
            <Badge tone={stage.tone}>{stage.label}</Badge>
          </h1>
          <div className="text-sm text-slate-500">
            {[
              t.deliveryNote && `B/L ${t.deliveryNote}`,
              t.parcel && `Parcelle ${t.parcel}`,
              t.origin,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() =>
              downloadFile(
                `/trucks/${t.id}/export.xlsx`,
                `etalage-${t.registration.replace(/\s+/g, "-")}.xlsx`
              )
            }
          >
            Exporter Excel
          </Button>
          <button onClick={confirmDelTruck} className="text-sm text-slate-400 hover:text-red-600">
            Supprimer
          </button>
        </div>
      </div>

      {/* Suppression / confirmation d'écart en échec — sinon le clic reste sans effet visible. */}
      {opError && (
        <div className="mt-3">
          <FormError>Opération échouée : {opError}</FormError>
        </div>
      )}

      {/* Écart de comptage billes — bordereau vs parc (assumé, non bloquant) */}
      {(declaredCount != null || billesOnParc != null) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge>Bordereau : {declaredCount ?? "—"} billes</Badge>
          <Badge>Parc : {billesOnParc ?? "—"} billes</Badge>
          {billonCount != null && <Badge>Tronçonnées en {billonCount} billons</Badge>}
          {countGap != null &&
            countGap !== 0 &&
            (t.countGapConfirmed ? (
              <>
                <Badge tone="emerald">
                  écart {countGap > 0 ? "+" : ""}
                  {countGap} · confirmé ✓
                </Badge>
                <button
                  type="button"
                  onClick={() => confirmGap.mutate(false)}
                  disabled={confirmGap.isPending}
                  className="text-slate-400 hover:text-slate-700 disabled:opacity-50"
                >
                  annuler
                </button>
              </>
            ) : (
              <>
                <Badge tone="amber">
                  écart {countGap > 0 ? "+" : ""}
                  {countGap}
                  {countGap < 0 ? " · à compléter ?" : ""}
                </Badge>
                <button
                  type="button"
                  onClick={() => confirmGap.mutate(true)}
                  disabled={confirmGap.isPending}
                  className="rounded-full border border-amber-300 px-2 py-0.5 font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  Confirmer l'écart
                </button>
              </>
            ))}
        </div>
      )}

      <TruckBordereau truck={t} />
      <PackingList truck={t} />

      {CONTEXTS.map((ctx) => {
        const measurement = t.measurements.find((m) => m.context === ctx);
        return (
          <section key={ctx} className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {MEASUREMENT_CONTEXT_LABELS[ctx]}
              </h2>
              {measurement && (
                <span className="text-sm font-semibold text-slate-900">
                  {fmtM3(measurementTotalM3(measurement))}
                </span>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {measurement ? (
                <MeasurementTable
                  m={measurement}
                  onDelete={() => {
                    if (
                      window.confirm(
                        `Supprimer ce relevé (${measurement.logs.length} ligne${measurement.logs.length > 1 ? "s" : ""}) ? Action irréversible.`
                      )
                    )
                      delMeasurement.mutate(measurement.id);
                  }}
                  onAppend={(data) =>
                    appendMeasurement.mutate({ measurementId: measurement.id, data })
                  }
                  appending={appendMeasurement.isPending}
                  billNos={ctx === "YARD_GIRTH" ? billNos : undefined}
                  appendDraftKey={`${t.id}:${ctx}:append`}
                  appendError={measError?.key === `${ctx}:append` ? measError.message : null}
                />
              ) : (
                <>
                  {/* Étalage Ø : reprendre les n° de billes déjà saisis en packing list. */}
                  {ctx === "YARD_DIAMETER" && !diaPrefill && (
                    (() => {
                      const ids = t.packingLogs
                        .map((p) => p.billNo?.trim())
                        .filter((v): v is string => !!v);
                      if (ids.length === 0) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            clearTallyDraft(`${t.id}:${ctx}`);
                            setDiaPrefill(ids);
                          }}
                          className="mb-3 w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs text-slate-600 hover:border-slate-900 hover:text-slate-900"
                        >
                          Préremplir les n° depuis la packing list ({ids.length} billes)
                        </button>
                      );
                    })()
                  )}
                  <TallyEntry
                    key={ctx === "YARD_DIAMETER" && diaPrefill ? "prefill" : "blank"}
                    context={ctx}
                    saving={addMeasurement.isPending}
                    error={measError?.key === ctx ? measError.message : null}
                    bills={ctx === "YARD_GIRTH" ? billNos : undefined}
                    draftKey={`${t.id}:${ctx}`}
                    initialIds={ctx === "YARD_DIAMETER" ? (diaPrefill ?? undefined) : undefined}
                    onSave={(data) => addMeasurement.mutate(data)}
                  />
                </>
              )}
            </div>
          </section>
        );
      })}

      {/* Étape suivante de la chaîne : ce que ce camion a donné à la scie. */}
      <TruckDebitageSection truck={t} />
    </div>
  );
}
