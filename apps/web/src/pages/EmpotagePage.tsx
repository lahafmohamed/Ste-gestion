import ContainersSection from "../components/ContainersSection";
import { PageHeader } from "../components/Layout";

// Pas de contrat : on charge ce qui est disponible au stock général.
export default function EmpotagePage() {
  return (
    <>
      <PageHeader
        title="Empotage"
        subtitle="Conteneurs d'export — chargés depuis le stock général (F3), plomb, statut."
      />
      <div className="mx-auto max-w-page-wide px-4 py-6 short:py-3">
        <ContainersSection />
      </div>
    </>
  );
}
