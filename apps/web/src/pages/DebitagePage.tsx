import ProductionSection from "../components/ProductionSection";
import CuttingSection from "../components/CuttingSection";
import { PageHeader } from "../components/Layout";

// Pas de contrat à choisir : on scie ce qui est au parc (tous contrats) et le
// débité tombe dans le stock général. Le contrat se déduit des camions sciés.
export default function DebitagePage() {
  return (
    <>
      <PageHeader
        title="Débitage"
        subtitle="Billons sciés → avivés par taille. Le débité part au stock général."
        wide={false}
      />
      <div className="mx-auto max-w-page px-4 py-6 short:py-3">
        <ProductionSection />
        <CuttingSection />
      </div>
    </>
  );
}
