import { useQuery } from "@tanstack/react-query";
import type { ContractDTO } from "@ste/shared";
import StepLayout from "../components/StepLayout";
import SalesSection from "../components/SalesSection";
import { QueryError } from "../components/ui/Feedback";
import { SkeletonList } from "../components/ui/Skeleton";
import { contractsApi } from "../lib/api";

export default function VentesPage() {
  return (
    <StepLayout title="Ventes / Export" subtitle="Sortie de stock — USD × taux ou CFA direct." wide>
      {(c) => <VentesInner contract={c} />}
    </StepLayout>
  );
}

function VentesInner({ contract }: { contract: ContractDTO }) {
  // Le stock par taille vient du résumé : il faut l'attendre avant d'ouvrir la
  // saisie (contrôle de dispo), et dire s'il échoue au lieu d'attendre toujours.
  const summary = useQuery({
    queryKey: ["summary", contract.id],
    queryFn: () => contractsApi.summary(contract.id),
  });
  if (summary.isError && !summary.data)
    return (
      <QueryError error={summary.error} onRetry={() => summary.refetch()}>
        Impossible de charger le stock du contrat
      </QueryError>
    );
  if (!summary.data)
    return (
      <div aria-busy="true">
        <SkeletonList count={2} lines={1} />
      </div>
    );
  return <SalesSection contract={contract} stock={summary.data.stockBySize} />;
}
