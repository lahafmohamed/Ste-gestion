import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DailyReportDTO } from "@ste/shared";
import { MEASUREMENT_CONTEXT_LABELS } from "@ste/shared";
import StepLayout from "../components/StepLayout";
import { contractsApi } from "../lib/api";
import { fmtNum, todayISO } from "../lib/format";
import Button from "../components/ui/Button";
import { cardCls } from "../components/ui/Card";
import DateField from "../components/ui/DateField";
import { FormError, QueryError } from "../components/ui/Feedback";
import { Field } from "../components/ui/Input";
import { SkeletonLine } from "../components/ui/Skeleton";
import { IconCheck } from "../components/icons";

const n3 = (v: string) => fmtNum(Number(v).toFixed(3));

/** Rapport texte brut (même forme que le rapport manuel actuel). */
function reportText(r: DailyReportDTO): string {
  const L: string[] = [];
  const d = new Date(`${r.date}T00:00:00`).toLocaleDateString("fr-FR");
  L.push(`RAPPORT DES ACTIVITÉS — ${d} — ${r.contractCode}`, "");

  if (r.arrivals.length > 0) {
    L.push(`ENTRÉE TECK (${r.arrivals.length} CAMION${r.arrivals.length > 1 ? "S" : ""})`, "");
    for (const a of r.arrivals) {
      L.push(
        `CAMION ${a.registration}${a.deliveryNote ? `   BL ${a.deliveryNote}` : ""}${
          a.origin ? `   ${a.origin}` : ""
        }`
      );
      const bits = [
        a.fieldM3 ? `VOL BROUSSE = ${n3(a.fieldM3)} m3` : null,
        a.logCount ? `Nbre BILLES ${a.logCount}` : null,
        a.parcel ? `PARCELLE ${a.parcel}` : null,
      ].filter(Boolean);
      if (bits.length) L.push(bits.join("     "));
      L.push("");
    }
  }

  if (r.tallies.length > 0) {
    L.push("ÉTALAGE TECK", "");
    for (const t of r.tallies) {
      // Girth = billons (266A, 266B…) — on rappelle le nb de billes mères.
      const unit = t.context === "YARD_GIRTH" ? "billons" : "billes";
      L.push(
        `CAMION ${t.registration} — ${MEASUREMENT_CONTEXT_LABELS[t.context]} : ${n3(
          t.totalM3
        )} m3 (${t.logCount} ${unit}${t.billCount != null ? ` · ${t.billCount} billes` : ""})`
      );
      if (t.girthGte85M3 !== null && t.girthLt85M3 !== null) {
        L.push(`VOL G ≥85 = ${n3(t.girthGte85M3)} m3     VOL G <85 = ${n3(t.girthLt85M3)} m3`);
      }
      L.push("");
    }
  }

  if (r.production.length > 0) {
    L.push("DÉBITÉ TECK", "");
    for (const p of r.production) {
      if (p.trucks.length > 0) L.push(`CAMION ${p.trucks.join(", ")}`);
      L.push(`VOL Prd = ${n3(p.totalM3)} m3 (${p.pieces} pièces)`);
      if (p.outputPct !== null) L.push(`Rend = ${Number(p.outputPct).toFixed(2)} %`);
      L.push(
        `Long 6,5 feet+ = ${n3(p.longM3)} m3 (${Number(p.longPct).toFixed(0)}%)     Long 6 feet- = ${n3(
          p.shortM3
        )} m3 (${(100 - Number(p.longPct)).toFixed(0)}%)`
      );
      for (const b of p.bands) {
        if (Number(b.m3) > 0) L.push(`${b.label} = ${n3(b.m3)} m3 (${Number(b.pct).toFixed(2)}%)`);
      }
      L.push("");
    }
  }

  if (r.loadings.length > 0) {
    L.push(`EMPOTAGE CONTENEURS (${r.loadings.length} TC)`, "");
    for (const c of r.loadings) {
      L.push(
        `TC ${c.containerNo}${c.grade ? ` (${c.grade})` : ""}${
          c.destination ? ` ${c.destination}` : ""
        }`
      );
      if (c.bookingNo) L.push(`BOOKING ${c.bookingNo}`);
      if (c.sealNo) L.push(`PLOMB : ${c.sealNo}`);
      if (c.fauxSealNo) L.push(`FAUX PLOMB : ${c.fauxSealNo}`);
      L.push(`Nbre Elm : ${c.pieces} — ${n3(c.totalM3)} m3`, "");
    }
  }

  if (
    r.arrivals.length + r.tallies.length + r.production.length + r.loadings.length ===
    0
  ) {
    L.push("Aucune activité enregistrée ce jour.");
  }

  return L.join("\n");
}

export default function RapportPage() {
  // Date du jour locale (lib/format) : toISOString() donnait la date UTC, donc
  // la veille en début de nuit sur un fuseau en avance.
  const [date, setDate] = useState(todayISO());

  return (
    <StepLayout title="Rapport d'activité" subtitle="Généré depuis les opérations du jour.">
      {(c) => <RapportInner contractId={c.id} date={date} setDate={setDate} />}
    </StepLayout>
  );
}

function RapportInner({
  contractId,
  date,
  setDate,
}: {
  contractId: string;
  date: string;
  setDate: (d: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const q = useQuery({
    queryKey: ["daily-report", contractId, date],
    queryFn: () => contractsApi.dailyReport(contractId, date),
  });

  const text = q.data ? reportText(q.data) : "";

  // Presse-papiers refusé (navigateur ancien, permission) : le dire au lieu
  // d'un bouton qui ne fait rien ; le texte reste sélectionnable à la main.
  async function copy() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError(true);
    }
  }

  // Impression / PDF : fenêtre autonome avec le rapport monospace + print().
  function printReport() {
    if (!q.data) return;
    const esc = (s: string) =>
      s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const title = `Rapport ${q.data.contractCode} ${date}`;
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(
      title
    )}</title><style>
      body { margin: 24px; font-family: "Courier New", monospace; font-size: 12px; color: #111; }
      pre { white-space: pre-wrap; line-height: 1.5; }
      @media print { body { margin: 0; } }
    </style></head><body><pre>${esc(text)}</pre>
    <script>window.onload=function(){window.print();};</script></body></html>`;
    const w = window.open("", "_blank", "width=800,height=700");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Field label="Date" className="w-full sm:w-48">
          <DateField value={date} onChange={setDate} max={todayISO()} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={printReport} disabled={!text}>
            Imprimer / PDF
          </Button>
          {/* Largeur fixe : « Copié » ne rétrécit pas le bouton sous le doigt. */}
          <Button variant="primary" onClick={copy} disabled={!text} className="min-w-[11rem]">
            {copied ? (
              <>
                <IconCheck width={16} height={16} className="-ml-0.5" />
                Copié
              </>
            ) : (
              "Copier le rapport"
            )}
          </Button>
        </div>
      </div>

      {copyError && (
        <div className="mb-3">
          <FormError hint="Sélectionner le texte du rapport et le copier à la main.">
            Copie automatique refusée par le navigateur.
          </FormError>
        </div>
      )}

      {/* Annonce discrète pour lecteur d'écran : la copie n'a pas d'autre retour. */}
      <span className="sr-only" aria-live="polite">
        {copied ? "Rapport copié" : ""}
      </span>

      {q.isLoading && (
        <div className={`${cardCls} space-y-2.5 p-4`} aria-busy="true">
          <SkeletonLine className="w-2/3" />
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="mt-5 w-3/4" />
          <SkeletonLine className="w-1/2" />
          <SkeletonLine className="w-2/3" />
        </div>
      )}
      {q.isError && (
        <QueryError error={q.error} onRetry={() => q.refetch()}>
          Impossible de générer le rapport du jour
        </QueryError>
      )}

      {q.data && (
        <pre
          className={`${cardCls} overflow-x-auto whitespace-pre-wrap p-4 font-mono text-sm leading-6 tabular-nums text-brand-800`}
        >
          {text}
        </pre>
      )}
    </>
  );
}
