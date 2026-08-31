import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { contractsApi } from "../lib/api";

// v2 : avant, le premier contrat OPEN était présélectionné — un camion pouvait
// donc partir sur un contrat que personne n'avait choisi. Le choix est
// maintenant explicite ; la clé est bumpée pour repartir à vide une fois.
const KEY = "ste.selectedContract.v2";

/**
 * Contrat courant (partagé entre les pages par étape), persisté en localStorage.
 * Aucun contrat par défaut : l'opérateur choisit, ensuite son choix le suit.
 */
export function useSelectedContract() {
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: contractsApi.list });
  const [id, setId] = useState<string | null>(() => localStorage.getItem(KEY));

  // Contrat supprimé (ou localStorage d'une autre base) → retour à « aucun ».
  useEffect(() => {
    if (!contracts.data || !id) return;
    if (!contracts.data.some((c) => c.id === id)) setId(null);
  }, [contracts.data, id]);

  useEffect(() => {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  }, [id]);

  return {
    contracts: contracts.data ?? [],
    isLoading: contracts.isLoading,
    selectedId: id,
    setSelectedId: setId,
    selected: contracts.data?.find((c) => c.id === id) ?? null,
  };
}
