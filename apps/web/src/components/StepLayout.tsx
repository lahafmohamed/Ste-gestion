import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ContractDTO } from "@ste/shared";
import { useSelectedContract } from "../hooks/useSelectedContract";
import ContractPicker from "./ContractPicker";
import { PageHeader } from "./Layout";

type Props = {
  title: string;
  subtitle?: string;
  children: (contract: ContractDTO) => ReactNode;
};

export default function StepLayout({ title, subtitle, children }: Props) {
  const { contracts, selectedId, setSelectedId, selected, isLoading } = useSelectedContract();

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        right={
          <ContractPicker contracts={contracts} value={selectedId} onChange={setSelectedId} />
        }
      />
      <div className="mx-auto max-w-3xl px-4 py-6">
        {isLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : !selected ? (
          <p className="text-sm text-slate-500">
            Aucun contrat.{" "}
            <Link to="/contracts" className="underline">
              Créer un contrat
            </Link>{" "}
            d'abord.
          </p>
        ) : (
          <>
            {/* Contrat clôturé : l'API refuse toute opération métier (409). Le
                dire ici évite de saisir un relevé entier pour rien. */}
            {selected.status === "CLOSED" && (
              <div className="mb-4 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
                🔒 Contrat {selected.code} clôturé — lecture seule.{" "}
                <Link to={`/contracts/${selected.id}`} className="underline">
                  Le rouvrir
                </Link>{" "}
                (Termes du contrat) pour corriger une saisie.
              </div>
            )}
            {children(selected)}
          </>
        )}
      </div>
    </>
  );
}
