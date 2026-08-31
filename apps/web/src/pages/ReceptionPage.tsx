import { useNavigate } from "react-router-dom";
import ReceptionSection from "../components/ReceptionSection";
import StepLayout from "../components/StepLayout";

/** Étape 1 · au portail : le bordereau SODEFOR, rien de plus. */
export default function ReceptionPage() {
  const navigate = useNavigate();
  // La mesure du bois est un autre poste : on passe la main à l'Étalage, sur le
  // camion qui vient d'être réceptionné.
  const onEtaler = (truckId: string) => navigate(`/etalage?truck=${truckId}`);

  return (
    <StepLayout
      title="Réception"
      // Le portail voit passer tous les camions : par défaut aucun contrat
      // n'est choisi et la liste les montre tous. Le contrat redevient
      // obligatoire au moment d'enregistrer un camion (dans le formulaire).
      renderAllContracts={() => <ReceptionSection contractId={null} onEtaler={onEtaler} />}
    >
      {(c) => (
        <ReceptionSection
          contractId={c.id}
          closed={c.status === "CLOSED"}
          onEtaler={onEtaler}
        />
      )}
    </StepLayout>
  );
}
