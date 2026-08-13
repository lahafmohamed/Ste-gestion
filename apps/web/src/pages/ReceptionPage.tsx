import { useNavigate } from "react-router-dom";
import ReceptionSection from "../components/ReceptionSection";
import StepLayout from "../components/StepLayout";

/** Étape 1 · au portail : le bordereau SODEFOR, rien de plus. */
export default function ReceptionPage() {
  const navigate = useNavigate();
  return (
    <StepLayout
      title="Réception"
      subtitle="Le camion arrive : bordereau SODEFOR (immat, B/L, parcelle, vol brousse, billes annoncées)."
      step="reception"
    >
      {(c) => (
        <ReceptionSection
          contractId={c.id}
          closed={c.status === "CLOSED"}
          // La mesure du bois est un autre poste : on passe la main à l'Étalage,
          // avec le camion à ouvrir quand il vient d'être réceptionné.
          onEtaler={(truckId) => navigate(truckId ? `/etalage?truck=${truckId}` : "/etalage")}
        />
      )}
    </StepLayout>
  );
}
