import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { LogDTO, MeasurementContext, MeasurementDTO } from "@ste/shared";
import {
  MEASUREMENT_CONTEXT_LABELS,
  measurementTotalM3,
  truckBillCount,
  truckBillNos,
} from "@ste/shared";
import { downloadFile, trucksApi } from "../lib/api";
import { clearTallyDraft } from "../lib/tallyDraft";
import { fmtM3, fmtNum } from "../lib/format";
import { useTruckMutations } from "../hooks/useTruckMutations";
import MeasurementTable from "../components/MeasurementTable";
import TallyEntry from "../components/TallyEntry";
import TruckBordereau from "../components/TruckBordereau";
import PackingList from "../components/PackingList";
import TruckDebitageSection from "../components/TruckDebitageSection";
import Badge, { type BadgeTone } from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Chip from "../components/ui/Chip";
import { BackLink } from "../components/ui/Card";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { FormError } from "../components/ui/Feedback";
import { SkeletonList } from "../components/ui/Skeleton";

const CONTEXTS: MeasurementContext[] = ["FIELD", "YARD_GIRTH", "YARD_DIAMETER"];

export default function TruckDetailPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();

  const q = useQuery({ queryKey: ["trucks", "detail", id], queryFn: () => trucksApi.get(id) });

  const {
    addMeasurement,
    appendMeasurement,
    delMeasurement,
    updateLog,
    delLog,
    confirmGap,
    delTruck,
    measError,
    opError,
  } = useTruckMutations(id, () => nav(-1));

  // Prérempli l'étalage Ø avec les n° de billes de la packing list (mesures à saisir).
  const [diaPrefill, setDiaPrefill] = useState<string[] | null>(null);

  // Onglet cubage actif (billes / billons) — évite de scroller entre les deux
  // tableaux. `null` = choix automatique selon l'étape atteinte.
  const [measTab, setMeasTab] = useState<MeasurementContext | null>(null);

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

  // Le cubage brousse vient du ticket SODEFOR (champ « Brousse déclaré » du
  // bordereau) — pas de saisie bille par bille. On n'affiche l'onglet FIELD
  // que si un ancien camion en a déjà une enregistrée.
  const tabs = CONTEXTS.filter(
    (ctx) => ctx !== "FIELD" || t.measurements.some((m) => m.context === "FIELD")
  );
  // Défaut : l'étape en cours — Ø pas encore étalé → billes, sinon billons.
  const fallback: MeasurementContext = t.measurements.some((m) => m.context === "YARD_DIAMETER")
    ? "YARD_GIRTH"
    : "YARD_DIAMETER";
  const activeCtx = measTab && tabs.includes(measTab) ? measTab : fallback;
  const measurement = t.measurements.find((m) => m.context === activeCtx);

  // Étalage Ø : reprendre les n° de billes déjà saisis en packing list.
  const packingIds = t.packingLogs
    .map((p) => p.billNo?.trim())
    .filter((v): v is string => !!v);

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
              billNos={activeCtx === "YARD_GIRTH" ? billNos : undefined}
              appendDraftKey={`${t.id}:${activeCtx}:append`}
              appendError={measError?.key === `${activeCtx}:append` ? measError.message : null}
              onUpdateLog={(logId, data) => updateLog.mutate({ logId, data })}
              onDeleteLog={setDelLogTarget}
              logPending={updateLog.isPending || delLog.isPending}
            />
          ) : (
            <>
              {/* Étalage Ø : reprendre les n° de billes déjà saisis en packing list. */}
              {activeCtx === "YARD_DIAMETER" && !diaPrefill && packingIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearTallyDraft(`${t.id}:${activeCtx}`);
                    setDiaPrefill(packingIds);
                  }}
                  className="mb-3 min-h-touch w-full rounded-lg border border-dashed border-brand-300 py-2 text-sm text-brand-600 hover:border-brand-900 hover:text-brand-900 active:bg-brand-100"
                >
                  Préremplir les n° depuis la packing list ({packingIds.length} billes)
                </button>
              )}
              <TallyEntry
                key={activeCtx === "YARD_DIAMETER" && diaPrefill ? "prefill" : "blank"}
                context={activeCtx}
                saving={addMeasurement.isPending}
                error={measError?.key === activeCtx ? measError.message : null}
                bills={activeCtx === "YARD_GIRTH" ? billNos : undefined}
                draftKey={`${t.id}:${activeCtx}`}
                initialIds={activeCtx === "YARD_DIAMETER" ? (diaPrefill ?? undefined) : undefined}
                onSave={(data) => addMeasurement.mutate(data)}
              />
            </>
          )}
        </div>
      </section>

      {/* Étape suivante de la chaîne : ce que ce camion a donné à la scie. */}
      <TruckDebitageSection truck={t} />

      <ConfirmDialog
        open={delTruckOpen}
        title={`Supprimer le camion ${t.registration} ?`}
        confirmLabel="Supprimer définitivement"
        pending={delTruck.isPending}
        onConfirm={() =>
          delTruck.mutate(undefined, { onError: () => setDelTruckOpen(false) })
        }
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
