import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  runGroupTotals,
  runPieceCount,
  runTotalM3,
  SIZE_GROUP_LABELS,
  type ProductionRunCreateInput,
  type SizeGroup,
} from "@ste/shared";
import { productionApi, trucksApi } from "../lib/api";
import { fmtInt, fmtM3 } from "../lib/format";
import SawnEntry from "./SawnEntry";

export default function ProductionSection({ contractId }: { contractId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const runs = useQuery({
    queryKey: ["production", contractId],
    queryFn: () => productionApi.listByContract(contractId),
  });

  const trucks = useQuery({
    queryKey: ["trucks", contractId],
    queryFn: () => trucksApi.listByContract(contractId),
  });

  const create = useMutation({
    mutationFn: productionApi.create,
    onSuccess: () => {
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["production", contractId] });
      qc.invalidateQueries({ queryKey: ["cutting", contractId] });
      qc.invalidateQueries({ queryKey: ["trucks", contractId] });
      qc.invalidateQueries({ queryKey: ["summary", contractId] });
      qc.invalidateQueries({ queryKey: ["contracts"] });
    },
  });

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Débitage ({runs.data?.length ?? 0} sessions)
        </h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:border-slate-900"
        >
          {showForm ? "Fermer" : "+ Session"}
        </button>
      </div>

      {showForm && (
        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-4">
          <SawnEntry
            saving={create.isPending}
            trucks={trucks.data}
            onSave={(data) =>
              create.mutate({ ...data, contractId } as ProductionRunCreateInput)
            }
          />
        </div>
      )}

      <div className="space-y-2">
        {runs.data?.length === 0 && !showForm && (
          <p className="text-sm text-slate-500">Aucune session de débitage.</p>
        )}
        {runs.data?.map((r) => {
          const groups = runGroupTotals(r);
          const linked = (trucks.data ?? []).filter((t) => r.truckIds.includes(t.id));
          return (
            <Link
              key={r.id}
              to={`/production-runs/${r.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-400"
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900">
                  {new Date(r.producedAt).toLocaleDateString("fr-FR")}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {fmtM3(runTotalM3(r))}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {fmtInt(runPieceCount(r))} pièces · {r.lines.length} lignes
                {(Object.keys(groups) as SizeGroup[])
                  .filter((g) => groups[g] > 0)
                  .map(
                    (g) => ` · ${SIZE_GROUP_LABELS[g]} ${groups[g].toFixed(3)}`
                  )
                  .join("")}
              </div>
              {r.truckIds.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {linked.map((t) => (
                    <span
                      key={t.id}
                      className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                    >
                      {t.registration}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
