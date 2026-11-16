import { useQuery } from "@tanstack/react-query";
import StepLayout from "../components/StepLayout";
import AccountsSection from "../components/AccountsSection";
import { Kpi, KpiStrip } from "../components/ui/Card";
import { QueryError } from "../components/ui/Feedback";
import { SkeletonLine } from "../components/ui/Skeleton";
import { contractsApi } from "../lib/api";
import { fmtFcfa } from "../lib/format";

export default function ComptaPage() {
  return (
    <StepLayout title="Comptabilité" subtitle="Dûs (dérivés) & paiements par tiers." wide>
      {(c) => <ComptaInner contractId={c.id} />}
    </StepLayout>
  );
}

/** Cellule fantôme de la bande : la page garde sa forme pendant le calcul. */
function SkeletonKpi() {
  return (
    <div className="bg-white px-4 py-3.5" aria-hidden>
      <SkeletonLine className="w-1/2" />
      <SkeletonLine className="mt-3 h-6 w-2/3" />
    </div>
  );
}

function ComptaInner({ contractId }: { contractId: string }) {
  const summary = useQuery({
    queryKey: ["summary", contractId],
    queryFn: () => contractsApi.summary(contractId),
  });
  const s = summary.data;
  const balance = s ? Number(s.balance) : 0;
  return (
    <>
      {summary.isError && !s ? (
        <div className="mb-4">
          <QueryError error={summary.error} onRetry={() => summary.refetch()}>
            Impossible de calculer la synthèse du contrat
          </QueryError>
        </div>
      ) : (
        // Une bande au lieu de quatre cartes : même motif que le tableau de bord
        // et l'onglet Dépenses. tabular-nums hérité par les montants.
        <KpiStrip className="mb-4 tabular-nums">
          {s ? (
            <>
              <Kpi bare label="Full cost" value={fmtFcfa(s.fullCost)} />
              <Kpi bare label="Payé" value={fmtFcfa(s.totalPaid)} />
              <Kpi
                bare
                label="Solde"
                value={fmtFcfa(s.balance)}
                hint={
                  balance > 0 ? "reste à payer" : balance < 0 ? "payé au-delà du coût" : "à jour"
                }
              />
              <Kpi bare label="Profit estimé" value={fmtFcfa(s.profitEstimate)} tone="accent" />
            </>
          ) : (
            <>
              <SkeletonKpi />
              <SkeletonKpi />
              <SkeletonKpi />
              <SkeletonKpi />
            </>
          )}
        </KpiStrip>
      )}
      <AccountsSection contractId={contractId} />
    </>
  );
}
