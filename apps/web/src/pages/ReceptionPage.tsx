import StepLayout from "../components/StepLayout";
import TrucksSection from "../components/TrucksSection";

export default function ReceptionPage() {
  return (
    <StepLayout
      title="Réception"
      subtitle="1. Camion arrive → 2. Étalage des billes → 3. Billonnage (266 → 266A, 266B…)."
    >
      {(c) => <TrucksSection contractId={c.id} closed={c.status === "CLOSED"} />}
    </StepLayout>
  );
}
