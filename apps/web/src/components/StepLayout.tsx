import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ContractDTO } from "@ste/shared";
import { useSelectedContract } from "../hooks/useSelectedContract";
import ContractPicker from "./ContractPicker";
import { IconContract, IconLock } from "./icons";
import { PageHeader } from "./Layout";
import { SkeletonList } from "./ui/Skeleton";
import { Notice, EmptyState } from "./ui/Feedback";

type Props = {
  title: string;
  subtitle?: string;
  /** Colonne large (72rem) : pages de consultation faites de tables/cartes.
      Les pages de saisie gardent la colonne 48rem (lignes courtes, lisibles). */
  wide?: boolean;
  /**
   * Rendu quand aucun contrat n'est choisi — vue « tous contrats confondus ».
   * Les pages qui calculent par contrat (étalage, réception) l'omettent :
   * elles demandent alors de choisir. Stock, débitage et empotage ne passent
   * plus par ici : ils travaillent sur le stock général.
   */
  renderAllContracts?: () => ReactNode;
  children: (contract: ContractDTO) => ReactNode;
};

export default function StepLayout({
  title,
  subtitle,
  wide = false,
  renderAllContracts,
  children,
}: Props) {
  const { contracts, selectedId, setSelectedId, selected, isLoading } = useSelectedContract();

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        wide={wide}
        right={
          <ContractPicker
            contracts={contracts}
            value={selectedId}
            onChange={setSelectedId}
            emptyLabel={renderAllContracts ? "Tous les contrats" : "— Choisir —"}
          />
        }
      />
      <div
        className={`mx-auto px-4 py-6 short:py-3 ${wide ? "max-w-page-wide" : "max-w-page"}`}
      >
        {isLoading ? (
          <SkeletonList count={2} />
        ) : contracts.length === 0 ? (
          <EmptyState>
            Aucun contrat.{" "}
            <Link to="/contracts" className="font-medium text-accent-700 underline hover:text-accent-800">
              Créer un contrat
            </Link>{" "}
            d'abord.
          </EmptyState>
        ) : !selected && renderAllContracts ? (
          renderAllContracts()
        ) : !selected ? (
          // Aucun contrat par défaut : un relevé d'étalage appartient à un
          // contrat précis — le choix ne se devine pas.
          <div className="mx-auto max-w-lg rounded-2xl bg-white px-6 py-8 text-center shadow-card">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-100 text-accent-600">
              <IconContract width={24} height={24} />
            </span>
            <p className="mt-4 text-base font-semibold text-brand-900">Choisir un contrat</p>
            <p className="mt-1 text-sm text-brand-500">
              Le contrat courant se choisit en haut de page, ou directement ici.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {contracts
                .filter((c) => c.status === "OPEN")
                .slice(0, 6)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="min-h-touch rounded-lg bg-white px-4 text-sm font-medium text-brand-800 shadow-card transition-[box-shadow,transform,background-color] duration-150 ease-out hover:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 motion-safe:active:scale-[0.96] active:bg-brand-50"
                  >
                    {c.code}
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <>
            {/* Contrat clôturé : l'API refuse toute opération métier (409). Le
                dire ici évite de saisir un relevé entier pour rien. */}
            {selected.status === "CLOSED" && (
              <Notice icon={IconLock} className="mb-4">
                Contrat {selected.code} clôturé — lecture seule.{" "}
                <Link to={`/contracts/${selected.id}`} className="underline">
                  Le rouvrir
                </Link>{" "}
                (Termes du contrat) pour corriger une saisie.
              </Notice>
            )}
            {children(selected)}
          </>
        )}
      </div>
    </>
  );
}
