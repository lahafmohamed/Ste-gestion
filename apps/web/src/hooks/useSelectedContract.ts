import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { contractsApi } from "../lib/api";

const KEY = "ste.selectedContract";

/**
 * Contrat courant (partagé entre les pages par étape), persisté en localStorage.
 * Défaut : premier contrat OPEN, sinon premier de la liste.
 */
export function useSelectedContract() {
  const contracts = useQuery({ queryKey: ["contracts"], queryFn: contractsApi.list });
  const [id, setId] = useState<string | null>(() => localStorage.getItem(KEY));

  useEffect(() => {
    if (!contracts.data) return;
    const exists = id && contracts.data.some((c) => c.id === id);
    if (!exists) {
      const fallback =
        contracts.data.find((c) => c.status === "OPEN")?.id ??
        contracts.data[0]?.id ??
        null;
      setId(fallback);
    }
  }, [contracts.data, id]);

  useEffect(() => {
    if (id) localStorage.setItem(KEY, id);
  }, [id]);

  return {
    contracts: contracts.data ?? [],
    isLoading: contracts.isLoading,
    selectedId: id,
    setSelectedId: setId,
    selected: contracts.data?.find((c) => c.id === id) ?? null,
  };
}
