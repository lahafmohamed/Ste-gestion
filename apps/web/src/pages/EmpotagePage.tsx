import StepLayout from "../components/StepLayout";
import ContainersSection from "../components/ContainersSection";

export default function EmpotagePage() {
  return (
    <StepLayout title="Empotage" subtitle="Conteneurs d'export — lignes avivés (F3), plomb, statut.">
      {(c) => <ContainersSection contractId={c.id} />}
    </StepLayout>
  );
}
