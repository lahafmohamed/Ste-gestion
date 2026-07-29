import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  runGroupTotals,
  runPieceCount,
  runTotalM3,
  sawnLongShortM3,
  sawnThicknessBands,
  SIZE_GROUP_LABELS,
  type SizeGroup,
} from "@ste/shared";
import { downloadFile, productionApi, trucksApi } from "../lib/api";
import { fmtInt, fmtNum, fmtPct } from "../lib/format";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";

export default function ProductionRunPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["production", "detail", id],
    queryFn: () => productionApi.get(id),
  });

  const contractId = q.data?.contractId;
  const trucksQ = useQuery({
    queryKey: ["trucks", contractId],
    queryFn: () => trucksApi.listByContract(contractId!),
    enabled: !!contractId,
  });

  const del = useMutation({
    mutationFn: () => productionApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production"] });
      qc.invalidateQueries({ queryKey: ["cutting"] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
      nav(-1);
    },
  });

  if (q.isLoading) return <p className="p-6 text-sm text-slate-500">Chargement…</p>;
  if (q.isError || !q.data)
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">Session introuvable.</p>
        <Link to="/contracts" className="text-sm text-slate-500 underline">
          ← Contrats
        </Link>
      </div>
    );

  const r = q.data;
  const groups = runGroupTotals(r);
  const total = runTotalM3(r);
  const { longM3, shortM3 } = sawnLongShortM3(r.lines);
  const bands = sawnThicknessBands(r.lines);
  const linkedTrucks = (trucksQ.data ?? []).filter((t) => r.truckIds.includes(t.id));
  // Billons sciés précisés sur la session (c'est le billon qui passe à la scie).
  const sawnBillons = linkedTrucks.flatMap((t) =>
    t.measurements
      .filter((m) => m.context === "YARD_GIRTH")
      .flatMap((m) => m.logs)
      .filter((l) => r.logIds.includes(l.id))
  );
  // Rendement = débité ÷ cubage des billons sciés si précisés, sinon camions entiers.
  const girthLinked =
    sawnBillons.length > 0
      ? sawnBillons.reduce((s, l) => s + Number(l.volumeM3), 0)
      : linkedTrucks.reduce(
          (s, t) =>
            s +
            t.measurements
              .filter((m) => m.context === "YARD_GIRTH")
              .reduce((x, m) => x + m.logs.reduce((y, l) => y + Number(l.volumeM3), 0), 0),
          0
        );
  const rendement = girthLinked > 0 ? (total / girthLinked) * 100 : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Link to={`/contracts/${r.contractId}`} className="text-sm text-slate-500">
        ← Contrat
      </Link>

      <div className="mt-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Débitage du {new Date(r.producedAt).toLocaleDateString("fr-FR")}
          </h1>
          <div className="text-sm text-slate-500">{r.note ?? ""}</div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() =>
              downloadFile(
                `/production-runs/${r.id}/export.xlsx`,
                `debite-${new Date(r.producedAt).toISOString().slice(0, 10)}.xlsx`
              )
            }
          >
            Exporter Excel
          </Button>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Supprimer cette session de débitage (${r.lines.length} ligne${r.lines.length > 1 ? "s" : ""}, ${fmtNum(total.toFixed(3))} m³) ? Action irréversible.`
                )
              )
                del.mutate();
            }}
            className="text-sm text-slate-400 hover:text-red-600"
          >
            Supprimer
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
          {fmtNum(runTotalM3(r).toFixed(6))} m³
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
          {fmtInt(runPieceCount(r))} pièces
        </span>
        {(Object.keys(groups) as SizeGroup[])
          .filter((g) => groups[g] > 0)
          .map((g) => (
            <span
              key={g}
              className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
            >
              {SIZE_GROUP_LABELS[g]} {fmtNum(groups[g].toFixed(3))} m³
            </span>
          ))}
      </div>

      {/* Camions sciés + rendement de la session */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs uppercase tracking-wide text-slate-400">Camions sciés :</span>
        {linkedTrucks.length === 0 ? (
          <span className="text-slate-400">aucun camion lié</span>
        ) : (
          linkedTrucks.map((t) => (
            <Link
              key={t.id}
              to={`/trucks/${t.id}`}
              className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-700 hover:border-slate-900"
            >
              {t.registration}
            </Link>
          ))
        )}
        {rendement !== null && (
          <Badge tone="emerald">
            Rendement {fmtPct(rendement)} ({fmtNum(girthLinked.toFixed(3))} m³ de billons
            {sawnBillons.length > 0 ? ` · ${sawnBillons.length} billons` : ""})
          </Badge>
        )}
      </div>

      {/* Billons sciés précisés */}
      {sawnBillons.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="uppercase tracking-wide text-slate-400">Billons sciés :</span>
          {sawnBillons.map((l) => (
            <Badge key={l.id} tone="emerald" title={`${Number(l.volumeM3).toFixed(4)} m³`}>
              {l.externalId ?? `#${l.position}`}
            </Badge>
          ))}
        </div>
      )}

      {/* Splits longueur & épaisseur (rapport d'activité) */}
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone="sky">
          Long ≥6,5ft {fmtNum(longM3.toFixed(3))} ({fmtPct((longM3 / total) * 100, 0)}) · court{" "}
          {fmtNum(shortM3.toFixed(3))} ({fmtPct((shortM3 / total) * 100, 0)})
        </Badge>
        {bands
          .filter((b) => b.m3 > 0)
          .map((b) => (
            <Badge key={b.key}>
              {b.label} {fmtNum(b.m3.toFixed(3))} ({fmtPct((b.m3 / total) * 100, 0)})
            </Badge>
          ))}
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 font-normal">#</th>
              <th className="py-1 font-normal">L (ft)</th>
              <th className="py-1 font-normal">l (in)</th>
              <th className="py-1 font-normal">ép (in)</th>
              <th className="py-1 text-right font-normal">Nbr</th>
              <th className="py-1 font-normal">Taille</th>
              <th className="py-1 text-right font-normal">m³</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="py-1 text-slate-400">{l.position}</td>
                <td className="py-1 tabular-nums">{fmtNum(l.lengthFt)}</td>
                <td className="py-1 tabular-nums">{fmtNum(l.widthIn)}</td>
                <td className="py-1 tabular-nums">{fmtNum(l.thicknessIn)}</td>
                <td className="py-1 text-right tabular-nums">{l.count}</td>
                <td className="py-1">{l.sizeCode}</td>
                <td className="py-1 text-right tabular-nums">{fmtNum(l.volumeM3)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-semibold">
              <td colSpan={4} className="py-1.5">
                Total
              </td>
              <td className="py-1.5 text-right tabular-nums">{fmtInt(runPieceCount(r))}</td>
              <td />
              <td className="py-1.5 text-right tabular-nums">
                {fmtNum(runTotalM3(r).toFixed(6))}
              </td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </div>
  );
}
