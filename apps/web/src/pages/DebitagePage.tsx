import StepLayout from "../components/StepLayout";
import ProductionSection from "../components/ProductionSection";
import CuttingSection from "../components/CuttingSection";

export default function DebitagePage() {
  return (
    <StepLayout
      title="Débitage"
      subtitle="Billons sciés → avivés par taille, rendement auto (débité ÷ billons)."
      step="debitage"
    >
      {(c) => (
        <>
          <ProductionSection contractId={c.id} />
          <CuttingSection contractId={c.id} />
        </>
      )}
    </StepLayout>
  );
}
