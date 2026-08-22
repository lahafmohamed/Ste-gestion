import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { LogDTO, LogUpdateInput, MeasurementContext, MeasurementDTO } from "@ste/shared";
import {
  MEASUREMENT_CONTEXT_LABELS,
  billParent,
  measurementTotalM3,
  truckBillCount,
  truckBillNos,
  type MeasurementCreateInput,
} from "@ste/shared";
import { downloadFile, trucksApi } from "../lib/api";
import { fmtM3, fmtNum, normalizeDecimal } from "../lib/format";
import TallyEntry, { clearTallyDraft } from "../components/TallyEntry";
import TruckBordereau from "../components/TruckBordereau";
import PackingList from "../components/PackingList";
import TruckDebitageSection from "../components/TruckDebitageSection";
import Badge, { type BadgeTone } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Chip from "../components/ui/Chip";
import { BackLink } from "../components/ui/Card";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { FormError } from "../components/ui/Feedback";
import { inputQuietCls } from "../components/ui/Input";
import { SkeletonList } from "../components/ui/Skeleton";
import { TableWrap } from "../components/ui/Table";

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
  onUpdateLog,
  onDeleteLog,
  logPending = false,
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
  /** Correction d'une ligne (erreur de saisie) — volume recalculé côté serveur. */
  onUpdateLog: (logId: string, data: LogUpdateInput) => void;
  onDeleteLog: (log: LogDTO) => void;
  logPending?: boolean;
}) {
  const isDia = m.context === "YARD_DIAMETER";
  const [byBill, setByBill] = useState(false);
  const [adding, setAdding] = useState(false);

  // Ligne en cours de correction : n° + mesures éditées sur place, volume
  // recalculé côté serveur à l'enregistrement.
  const [edit, setEdit] = useState<{ id: string; externalId: string; a: string; b: string } | null>(
    null
  );
  function startEdit(l: LogDTO) {
    setEdit({
      id: l.id,
      externalId: l.externalId ?? "",
      a: String((isDia ? l.lengthFt : l.lengthM) ?? ""),
      b: String((isDia ? l.diameterIn : l.circumferenceCm) ?? ""),
    });
  }
  const editValid = !!edit && Number(edit.a) > 0 && Number(edit.b) > 0;
  function saveEdit() {
    if (!edit || !editValid) return;
    const id = edit.externalId.trim();
    onUpdateLog(edit.id, {
      externalId: id || null,
      ...(isDia ? { lengthFt: edit.a, diameterIn: edit.b } : { lengthM: edit.a, circumferenceCm: edit.b }),
    });
    setEdit(null);
  }

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

  const total = measurementTotalM3(m);
  const vols = m.logs.map((l) => Number(l.volumeM3));

  return (
    <div>
      {/* Téléphone (< sm) : le tableau 520px force un scroll horizontal — les
          lignes se replient en cartes 2 rangées (même motif que TallyEntry) :
          rangée 1 = n° + mesures, rangée 2 = m³ + actions. */}
      <div className="sm:hidden">
        {m.logs.map((l) =>
          edit?.id === l.id ? (
            <div key={l.id} className="mt-1 rounded-lg bg-brand-50 p-2">
              <div className="grid grid-cols-[1.6rem_1.2fr_1fr_1fr] items-end gap-1">
                <span className="pb-3 text-xs text-brand-400">{l.position}</span>
                <label className="min-w-0">
                  <span className="mb-0.5 block text-xs text-brand-500">N° log</span>
                  <input
                    value={edit.externalId}
                    onChange={(e) => setEdit({ ...edit, externalId: e.target.value })}
                    className={inputQuietCls}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-0.5 block text-xs text-brand-500">L (m)</span>
                  <input
                    inputMode="decimal"
                    value={edit.a}
                    onChange={(e) => setEdit({ ...edit, a: normalizeDecimal(e.target.value) })}
                    className={inputQuietCls}
                  />
                </label>
                <label className="min-w-0">
                  <span className="mb-0.5 block text-xs text-brand-500">
                    {isDia ? "Ø (cm)" : "Circ (cm)"}
                  </span>
                  <input
                    inputMode="decimal"
                    value={edit.b}
                    onChange={(e) => setEdit({ ...edit, b: normalizeDecimal(e.target.value) })}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    className={inputQuietCls}
                  />
                </label>
              </div>
              <div className="mt-2 flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  className="min-h-touch rounded-lg px-3 text-sm text-brand-400 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                >
                  Annuler
                </button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!editValid || logPending}
                  onClick={saveEdit}
                >
                  OK
                </Button>
              </div>
            </div>
          ) : (
            <div key={l.id} className="border-b border-brand-100 py-1.5">
              <div className="flex items-baseline gap-2">
                <span className="w-6 shrink-0 text-xs text-brand-400">{l.position}</span>
                <span className="min-w-0 flex-1 truncate">{l.externalId ?? "—"}</span>
                <span className="tabular-nums text-brand-600">
                  {fmtNum(isDia ? (l.lengthFt ?? 0) : (l.lengthM ?? 0))}
                  {" × "}
                  {fmtNum(isDia ? (l.diameterIn ?? 0) : (l.circumferenceCm ?? 0))}
                </span>
              </div>
              <div className="flex items-center justify-between pl-8">
                <span className="tabular-nums text-brand-700">
                  <span className="mr-1 text-xs text-brand-400">m³</span>
                  {fmtNum(l.volumeM3)}
                </span>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => startEdit(l)}
                    aria-label={`Corriger la ligne ${l.position}`}
                    className="flex min-h-touch w-11 items-center justify-center rounded-lg text-brand-300 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteLog(l)}
                    aria-label={`Supprimer la ligne ${l.position}`}
                    className="flex min-h-touch w-11 items-center justify-center rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )
        )}
        <div className="mt-2 flex items-center justify-between font-semibold">
          <span>
            Total ({m.logs.length} {m.context === "YARD_GIRTH" ? "billons" : "billes"}
            {hasBillons && ` · ${bills.length} billes`})
          </span>
          <span className="tabular-nums">{fmtNum(total.toFixed(6))}</span>
        </div>
        {m.logs.length > 1 && (
          <div className="mt-1 text-xs text-brand-500">
            Moy {fmtNum((total / vols.length).toFixed(4))} · Max{" "}
            {fmtNum(Math.max(...vols).toFixed(4))} · Min {fmtNum(Math.min(...vols).toFixed(4))}
          </div>
        )}
      </div>

      <TableWrap className="-mx-4 hidden px-4 sm:block">
      <table className="w-full min-w-[520px] text-base">
        <thead>
          <tr className="text-left text-xs text-brand-500">
            <th className="py-1 font-normal">#</th>
            <th className="py-1 font-normal">N° log</th>
            <th className="py-1 font-normal">L (m)</th>
            <th className="py-1 font-normal">{isDia ? "Ø (cm)" : "Circ (cm)"}</th>
            <th className="py-1 text-right font-normal">m³</th>
            {isDia && <th className="py-1 text-right font-normal">CFT</th>}
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {m.logs.map((l) =>
            edit?.id === l.id ? (
              // Correction : n° + mesures éditables, volume recalculé côté serveur.
              <tr key={l.id} className="border-t border-brand-100 bg-brand-50">
                <td className="py-1.5 text-brand-400">{l.position}</td>
                <td className="py-1.5 pr-1">
                  <input
                    value={edit.externalId}
                    onChange={(e) => setEdit({ ...edit, externalId: e.target.value })}
                    aria-label={`N° log ligne ${l.position}`}
                    className={inputQuietCls}
                  />
                </td>
                <td className="py-1.5 pr-1">
                  <input
                    inputMode="decimal"
                    value={edit.a}
                    onChange={(e) => setEdit({ ...edit, a: normalizeDecimal(e.target.value) })}
                    aria-label={`Longueur ligne ${l.position}`}
                    className={inputQuietCls}
                  />
                </td>
                <td className="py-1.5 pr-1">
                  <input
                    inputMode="decimal"
                    value={edit.b}
                    onChange={(e) => setEdit({ ...edit, b: normalizeDecimal(e.target.value) })}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    aria-label={isDia ? `Ø ligne ${l.position}` : `Circonférence ligne ${l.position}`}
                    className={inputQuietCls}
                  />
                </td>
                <td colSpan={isDia ? 3 : 2} className="py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!editValid || logPending}
                      onClick={saveEdit}
                    >
                      OK
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEdit(null)}
                      aria-label="Annuler la correction"
                      className="min-h-touch rounded-lg px-2 text-sm text-brand-400 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                    >
                      Annuler
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={l.id} className="border-t border-brand-100">
                <td className="py-1 text-brand-400">{l.position}</td>
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
                <td className="py-1">
                  {/* Erreur d'entrée au parc : corriger ou supprimer la ligne. */}
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => startEdit(l)}
                      aria-label={`Corriger la ligne ${l.position}`}
                      className="flex min-h-touch w-11 items-center justify-center rounded-lg text-brand-300 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLog(l)}
                      aria-label={`Supprimer la ligne ${l.position}`}
                      className="flex min-h-touch w-11 items-center justify-center rounded-lg text-lg text-brand-300 hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                    >
                      ×
                    </button>
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-brand-200 font-semibold">
            <td colSpan={4} className="py-1.5">
              Total ({m.logs.length} {m.context === "YARD_GIRTH" ? "billons" : "billes"}
              {hasBillons && ` · ${bills.length} billes`})
            </td>
            <td className="py-1.5 text-right tabular-nums">
              {fmtNum(measurementTotalM3(m).toFixed(6))}
            </td>
            {isDia && <td />}
            <td />
          </tr>
          {m.logs.length > 1 &&
            (() => {
              const vols = m.logs.map((l) => Number(l.volumeM3));
              const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
              return (
                <tr className="text-xs text-brand-500">
                  <td colSpan={4} className="py-1">
                    Moy {fmtNum(avg.toFixed(4))} · Max {fmtNum(Math.max(...vols).toFixed(4))} ·
                    Min {fmtNum(Math.min(...vols).toFixed(4))}
                  </td>
                  <td />
                  {isDia && <td />}
                  <td />
                </tr>
              );
            })()}
        </tfoot>
      </table>
      </TableWrap>

      {byBill && (
        <div className="mt-3 rounded-lg bg-brand-50 p-3">
          <div className="mb-1 text-xs font-medium text-brand-500">
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
        <button
          onClick={onDelete}
          className="min-h-touch rounded-lg px-2 text-sm text-brand-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
        >
          Supprimer cet étalage
        </button>
        {hasBillons && (
          <button
            onClick={() => setByBill((s) => !s)}
            className="min-h-touch rounded-lg px-2 text-sm text-brand-500 hover:bg-brand-100 hover:text-brand-900 active:bg-brand-200"
          >
            {byBill ? "Masquer la vue par bille" : "Vue par bille"}
          </button>
        )}
      </div>

      {adding && onAppend && (
        <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
          <div className="mb-2 text-xs font-medium text-brand-500">
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
            className="mt-2 min-h-touch rounded-lg px-2 text-sm text-brand-400 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200"
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

  // Correction / suppression d'une ligne enregistrée (erreur de saisie au parc).
  const updateLog = useMutation({
    mutationFn: ({ logId, data }: { logId: string; data: LogUpdateInput }) =>
      trucksApi.updateLog(logId, data),
    onSuccess: () => {
      setOpError(null);
      refresh();
    },
    onError: (e: Error) => setOpError(e.message),
  });

  const delLog = useMutation({
    mutationFn: trucksApi.removeLog,
    onSuccess: () => {
      setOpError(null);
      refresh();
    },
    onError: (e: Error) => setOpError(e.message),
  });

  // Prérempli l'étalage Ø avec les n° de billes de la packing list (mesures à saisir).
  const [diaPrefill, setDiaPrefill] = useState<string[] | null>(null);

  // Onglet cubage actif (billes / billons) — évite de scroller entre les deux
  // tableaux. `null` = choix automatique selon l'étape atteinte.
  const [measTab, setMeasTab] = useState<MeasurementContext | null>(null);

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
    onError: (e: Error) => {
      setDelTruckOpen(false);
      setOpError(e.message);
    },
  });

  // Confirmations lisibles sur tablette (remplacent window.confirm).
  const [delTruckOpen, setDelTruckOpen] = useState(false);
  const [delMeas, setDelMeas] = useState<MeasurementDTO | null>(null);
  const [delLogTarget, setDelLogTarget] = useState<LogDTO | null>(null);

  if (q.isLoading)
    return (
      <div className="mx-auto max-w-page px-4 py-6">
        <SkeletonList count={3} />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">Camion introuvable.</p>
        <Link to="/contracts" className="text-sm text-brand-500 underline">
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
    ? { label: "Scié", tone: "info" }
    : billonCount != null
      ? { label: "Billonné · sur parc", tone: "parc" }
      : t.measurements.some((m) => m.context === "YARD_DIAMETER")
        ? { label: "Étalé · à billonner", tone: "info" }
        : { label: "À étaler", tone: "amber" };

  return (
    <div className="mx-auto max-w-page px-4 py-6 short:py-3">
      <BackLink to={`/contracts/${t.contractId}`}>Contrat</BackLink>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-title font-semibold text-brand-900">
            {t.registration}
            {/* Où en est le camion dans la chaîne — visible sans dérouler la page. */}
            <Badge tone={stage.tone}>{stage.label}</Badge>
          </h1>
          <div className="text-sm text-brand-500">
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
          <Button variant="ghost-danger" size="sm" onClick={() => setDelTruckOpen(true)}>
            Supprimer
          </Button>
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
                <Badge tone="parc">
                  écart {countGap > 0 ? "+" : ""}
                  {countGap} · confirmé ✓
                </Badge>
                <button
                  type="button"
                  onClick={() => confirmGap.mutate(false)}
                  disabled={confirmGap.isPending}
                  className="min-h-touch rounded-lg px-2 text-brand-400 hover:bg-brand-100 hover:text-brand-700 active:bg-brand-200 disabled:opacity-50"
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
                  className="min-h-touch rounded-full border border-amber-300 px-3 py-1 font-medium text-amber-700 hover:bg-amber-100 active:bg-amber-200 disabled:opacity-50"
                >
                  Confirmer l'écart
                </button>
              </>
            ))}
        </div>
      )}

      <TruckBordereau truck={t} />
      <PackingList truck={t} />

      {(() => {
        // Le cubage brousse vient du ticket SODEFOR (champ « Brousse déclaré » du
        // bordereau) — pas de saisie bille par bille. On n'affiche l'onglet FIELD
        // que si un ancien camion en a déjà une enregistrée.
        const tabs = CONTEXTS.filter(
          (ctx) => ctx !== "FIELD" || t.measurements.some((m) => m.context === "FIELD")
        );
        // Défaut : l'étape en cours — Ø pas encore étalé → billes, sinon billons.
        const fallback: MeasurementContext = t.measurements.some(
          (m) => m.context === "YARD_DIAMETER"
        )
          ? "YARD_GIRTH"
          : "YARD_DIAMETER";
        const activeCtx = measTab && tabs.includes(measTab) ? measTab : fallback;

        const measurement = t.measurements.find((m) => m.context === activeCtx);
        const ctx = activeCtx;
        return (
          <section className="mt-5">
            {/* Un seul tableau à l'écran : on bascule billes ↔ billons au lieu de scroller. */}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {tabs.map((c) => {
                const m = t.measurements.find((x) => x.context === c);
                return (
                  <Chip key={c} selected={c === activeCtx} onClick={() => setMeasTab(c)}>
                    {MEASUREMENT_CONTEXT_LABELS[c]}
                    {m ? ` · ${fmtM3(measurementTotalM3(m))}` : " · à saisir"}
                  </Chip>
                );
              })}
            </div>
            <div className="rounded-xl border border-brand-200 bg-white p-4">
              {measurement ? (
                <MeasurementTable
                  m={measurement}
                  onDelete={() => setDelMeas(measurement)}
                  onAppend={(data) =>
                    appendMeasurement.mutate({ measurementId: measurement.id, data })
                  }
                  appending={appendMeasurement.isPending}
                  billNos={ctx === "YARD_GIRTH" ? billNos : undefined}
                  appendDraftKey={`${t.id}:${ctx}:append`}
                  appendError={measError?.key === `${ctx}:append` ? measError.message : null}
                  onUpdateLog={(logId, data) => updateLog.mutate({ logId, data })}
                  onDeleteLog={setDelLogTarget}
                  logPending={updateLog.isPending || delLog.isPending}
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
                          className="mb-3 min-h-touch w-full rounded-lg border border-dashed border-brand-300 py-2 text-sm text-brand-600 hover:border-brand-900 hover:text-brand-900 active:bg-brand-100"
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
      })()}

      {/* Étape suivante de la chaîne : ce que ce camion a donné à la scie. */}
      <TruckDebitageSection truck={t} />

      <ConfirmDialog
        open={delTruckOpen}
        title={`Supprimer le camion ${t.registration} ?`}
        confirmLabel="Supprimer définitivement"
        pending={delTruck.isPending}
        onConfirm={() => delTruck.mutate()}
        onCancel={() => setDelTruckOpen(false)}
      >
        {(() => {
          const n = t.measurements.reduce((s, m) => s + m.logs.length, 0);
          return `${n} mesure${n > 1 ? "s" : ""} et sa packing list seront effacées. Action irréversible.`;
        })()}
      </ConfirmDialog>

      <ConfirmDialog
        open={delMeas !== null}
        title="Supprimer ce relevé ?"
        confirmLabel="Supprimer le relevé"
        onConfirm={() => {
          if (delMeas) delMeasurement.mutate(delMeas.id);
          setDelMeas(null);
        }}
        onCancel={() => setDelMeas(null)}
      >
        {delMeas
          ? `${delMeas.logs.length} ligne${delMeas.logs.length > 1 ? "s" : ""} seront effacées. Action irréversible.`
          : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={delLogTarget !== null}
        title={`Supprimer la ligne ${delLogTarget?.externalId ?? `n° ${delLogTarget?.position ?? ""}`} ?`}
        confirmLabel="Supprimer la ligne"
        onConfirm={() => {
          if (delLogTarget) delLog.mutate(delLogTarget.id);
          setDelLogTarget(null);
        }}
        onCancel={() => setDelLogTarget(null)}
      >
        {delLogTarget
          ? `${fmtNum(delLogTarget.volumeM3)} m³ retirés du relevé. Action irréversible.`
          : null}
      </ConfirmDialog>
    </div>
  );
}
