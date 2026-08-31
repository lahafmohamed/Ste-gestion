import { useSearchParams } from "react-router-dom";
import EtalageSection from "../components/EtalageSection";
import StepLayout from "../components/StepLayout";

/** Étapes 2 et 3 · le parc, sur tablette : étaler les billes puis billonner. */
export default function EtalagePage() {
  const [params, setParams] = useSearchParams();

  return (
    <StepLayout title="Étalage">
      {(c) => (
        <EtalageSection
          contractId={c.id}
          closed={c.status === "CLOSED"}
          // `?truck=…` vient de la Réception : ouvrir ce camion une seule fois,
          // puis nettoyer l'URL — sinon un rechargement le réouvre en boucle.
          openTruckId={params.get("truck")}
          onOpened={() => setParams({}, { replace: true })}
        />
      )}
    </StepLayout>
  );
}
