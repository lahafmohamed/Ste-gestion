import { useQuery } from "@tanstack/react-query";
import StepLayout from "../components/StepLayout";
import AccountsSection from "../components/AccountsSection";
import { contractsApi } from "../lib/api";
import { fmtFcfa } from "../lib/format";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default function ComptaPage() {
  return (
    <StepLayout title="Comptabilité" subtitle="Dûs (dérivés) & paiements par tiers.">
      {(c) => <ComptaInner contractId={c.id} />}
    </StepLayout>
  );
}

function ComptaInner({ contractId }: { contractId: string }) {
  const summary = useQuery({
    queryKey: ["summary", contractId],
    queryFn: () => contractsApi.summary(contractId),
  });
  const s = summary.data;
  return (
    <>
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Full cost" value={fmtFcfa(s.fullCost)} />
          <Kpi label="Payé" value={fmtFcfa(s.totalPaid)} />
          <Kpi label="Solde" value={fmtFcfa(s.balance)} />
          <Kpi label="Profit estimé" value={fmtFcfa(s.profitEstimate)} />
        </div>
      )}
      <AccountsSection contractId={contractId} />
    </>
  );
}
