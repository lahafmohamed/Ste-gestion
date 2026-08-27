import { useNavigate, useSearchParams } from "react-router-dom";
import ReceptionSection from "../components/ReceptionSection";
import StepLayout from "../components/StepLayout";
import {
  BordereauVariant,
  GuichetVariant,
  VariantPicker,
  type ReceptionVariantKey,
} from "../variants/ReceptionVariants";

/** Étape 1 · au portail : le bordereau SODEFOR, rien de plus. */
export default function ReceptionPage() {
  const navigate = useNavigate();
  // HARNAIS DE VARIANTES (temporaire) : ?variant=guichet|bordereau — fiche
  // (l'actuel) par défaut. À retirer avec src/variants/ après promotion.
  const [params] = useSearchParams();
  const variant = (params.get("variant") ?? "fiche") as ReceptionVariantKey;
  return (
    <StepLayout
      title="Réception"
      subtitle="Le camion arrive : bordereau SODEFOR (immat, B/L, parcelle, vol brousse, billes annoncées)."
      step="reception"
    >
      {(c) => {
        const props = {
          contractId: c.id,
          closed: c.status === "CLOSED",
          // La mesure du bois est un autre poste : on passe la main à l'Étalage,
          // avec le camion à ouvrir quand il vient d'être réceptionné.
          onEtaler: (truckId: string | null) =>
            navigate(truckId ? `/etalage?truck=${truckId}` : "/etalage"),
        };
        return (
          <>
            {variant === "guichet" ? (
              <GuichetVariant {...props} />
            ) : variant === "bordereau" ? (
              <BordereauVariant {...props} />
            ) : (
              <ReceptionSection {...props} />
            )}
            <VariantPicker />
          </>
        );
      }}
    </StepLayout>
  );
}
