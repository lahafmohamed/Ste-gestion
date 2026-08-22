import { useQuery } from "@tanstack/react-query";
import StepLayout from "../components/StepLayout";
import SalesSection from "../components/SalesSection";
import { contractsApi } from "../lib/api";

export default function VentesPage() {
  return (
    <StepLayout title="Ventes / Export" subtitle="Sortie de stock — USD × taux ou CFA direct." wide>
      {(c) => <VentesInner contractId={c.id} contract={c} />}
    </StepLayout>
  );
}

function VentesInner({ contractId, contract }: { contractId: string; contract: import("@ste/shared").ContractDTO }) {
  const summary = useQuery({
    queryKey: ["summary", contractId],
    queryFn: () => contractsApi.summary(contractId),
  });
  if (!summary.data) return <p className="text-sm text-brand-500">Chargement du stock…</p>;
  return <SalesSection contract={contract} stock={summary.data.stockBySize} />;
}
