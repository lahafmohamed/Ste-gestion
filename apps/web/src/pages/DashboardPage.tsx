import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ContractDTO } from "@ste/shared";
import { contractsApi } from "../lib/api";
import { fmtFcfa, fmtM3, fmtPct } from "../lib/format";
import { PageHeader } from "../components/Layout";
import { QuotaBar } from "../components/QuotaGauge";

function ContractCard({ c }: { c: ContractDTO }) {
  const summary = useQuery({
    queryKey: ["summary", c.id],
    queryFn: () => contractsApi.summary(c.id),
  });
  const s = summary.data;

  return (
    <Link
      to={`/contracts/${c.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-400 active:border-slate-500 active:bg-slate-50"
    >
      <div className="flex items-center justify-between">
        <div className="font-medium text-slate-900">{c.code}</div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            c.status === "OPEN" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {c.status === "OPEN" ? "Ouvert" : "Clôturé"}
        </span>
      </div>

      {s ? (
        <div className="mt-3 space-y-2">
          <div>
            <div className="mb-1 text-xs text-slate-500">
              Camions {s.trucksEntered}
              {/* Total projeté depuis la moyenne des arrivées ; à défaut le prévu saisi. */}
              {s.estTrucksTotal != null
                ? `/≈${s.estTrucksTotal}`
                : c.trucksPlanned > 0
                  ? `/${c.trucksPlanned}`
                  : ""}{" "}
              · {s.trucksSawn} sciés
            </div>
            <QuotaBar brousseM3={s.brousseM3} quotaM3={c.quotaM3} />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>Débité : {fmtM3(s.debitedM3)} ({fmtPct(Number(s.outputPct))})</span>
            <span>Stock : {fmtM3(s.stockProductsM3)}</span>
            <span>CA : {fmtFcfa(s.salesRevenueCfa)}</span>
            <span>Solde : {fmtFcfa(s.balance)}</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-slate-400">Chargement…</div>
      )}
    </Link>
  );
}

export default function DashboardPage() {
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: contractsApi.list });

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble par contrat." />
      <div className="mx-auto max-w-3xl px-4 py-6">
        {contracts.isLoading && <p className="text-sm text-slate-500">Chargement…</p>}
        {contracts.data?.length === 0 && (
          <p className="text-sm text-slate-500">
            Aucun contrat.{" "}
            <Link to="/contracts" className="underline">
              Créer un contrat
            </Link>
            .
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {contracts.data?.map((c) => (
            <ContractCard key={c.id} c={c} />
          ))}
        </div>
      </div>
    </>
  );
}
