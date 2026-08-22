import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ContractDTO } from "@ste/shared";
import { contractsApi } from "../lib/api";
import { fmtFcfa, fmtM3, fmtPct } from "../lib/format";
import { SHOW_MONEY } from "../lib/features";
import { PageHeader } from "../components/Layout";
import { QuotaBar } from "../components/QuotaGauge";
import Badge from "../components/ui/Badge";
import { EmptyState, QueryError } from "../components/ui/Feedback";
import { buttonCls } from "../components/ui/Button";
import { SkeletonLine, SkeletonList } from "../components/ui/Skeleton";

function ContractCard({ c }: { c: ContractDTO }) {
  const summary = useQuery({
    queryKey: ["summary", c.id],
    queryFn: () => contractsApi.summary(c.id),
  });
  const s = summary.data;

  return (
    <Link
      to={`/contracts/${c.id}`}
      className="block rounded-xl border border-brand-200 bg-white p-4 transition-colors hover:border-brand-400 active:border-brand-500 active:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-900"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-brand-900">{c.code}</div>
        <Badge tone={c.status === "OPEN" ? "parc" : "brand"}>
          {c.status === "OPEN" ? "Ouvert" : "Clôturé"}
        </Badge>
      </div>

      {s ? (
        <div className="mt-3 space-y-2">
          <div>
            <div className="mb-1 text-sm text-brand-500">
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
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-brand-600">
            <span>Débité : {fmtM3(s.debitedM3)} ({fmtPct(Number(s.outputPct))})</span>
            <span>Stock : {fmtM3(s.stockProductsM3)}</span>
            {SHOW_MONEY && (
              <>
                <span>CA : {fmtFcfa(s.salesRevenueCfa)}</span>
                <span>Solde : {fmtFcfa(s.balance)}</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2" aria-hidden>
          <SkeletonLine className="w-2/3" />
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-1/2" />
        </div>
      )}
    </Link>
  );
}

export default function DashboardPage() {
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: contractsApi.list });

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble par contrat." />
      <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3">
        {contracts.isLoading && <SkeletonList count={2} lines={3} />}
        {contracts.isError && (
          <QueryError error={contracts.error} onRetry={() => contracts.refetch()}>
            Impossible de charger les contrats
          </QueryError>
        )}
        {contracts.data?.length === 0 && (
          <EmptyState
            action={
              <Link to="/contracts?nouveau=1" className={buttonCls("primary", "md")}>
                + Créer un contrat
              </Link>
            }
          >
            Aucun contrat pour l'instant.
          </EmptyState>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {contracts.data?.map((c) => (
            <ContractCard key={c.id} c={c} />
          ))}
        </div>
      </div>
    </>
  );
}
