import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ContractDTO } from "@ste/shared";
import { useSelectedContract } from "../hooks/useSelectedContract";
import { useCan } from "../lib/auth";
import ContractPicker from "./ContractPicker";
import { IconContract, IconLock, IconPlus } from "./icons";
import { PageHeader } from "./Layout";
import Button, { buttonCls } from "./ui/Button";
import { SkeletonList } from "./ui/Skeleton";
import { Notice, EmptyState } from "./ui/Feedback";

// Raccourcis du choix de contrat : au-delà, la liste déroulante d'en-tête.
const QUICK_PICKS = 6;

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
  const can = useCan();
  const open = contracts.filter((c) => c.status === "OPEN");

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
            emptyLabel={renderAllContracts ? "Tous les contrats" : "Choisir un contrat"}
          />
        }
      />
      <div
        className={`mx-auto px-4 py-6 short:py-3 ${wide ? "max-w-page-wide" : "max-w-page"}`}
      >
        {isLoading ? (
          <SkeletonList count={2} />
        ) : contracts.length === 0 ? (
          <EmptyState
            action={
              can("contracts.create") ? (
                <Link to="/contracts?nouveau=1" className={buttonCls("primary", "md")}>
                  <IconPlus width={16} height={16} className="-ml-0.5" />
                  Créer un contrat
                </Link>
              ) : undefined
            }
          >
            {can("contracts.create")
              ? "Aucun contrat pour l'instant. La saisie se rattache à un contrat : commencez par en créer un."
              : "Aucun contrat pour l'instant. Demandez au bureau d'en créer un pour commencer la saisie."}
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
            <h2 className="mt-4 text-base font-semibold text-brand-900">Choisir un contrat</h2>
            {open.length > 0 ? (
              <>
                <p className="mt-1 text-sm text-brand-600">
                  {open.length > QUICK_PICKS
                    ? `Les ${QUICK_PICKS} premiers contrats ouverts ci-dessous ; les autres dans la liste en haut de page.`
                    : "Touchez un contrat ouvert ci-dessous, ou choisissez-le en haut de page."}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {open.slice(0, QUICK_PICKS).map((c) => (
                    <Button key={c.id} onClick={() => setSelectedId(c.id)} className="px-4">
                      {c.code}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              // Tous clôturés : pas de raccourci vide, on dit où regarder.
              <p className="mt-1 text-sm text-brand-600">
                Aucun contrat ouvert. Les contrats clôturés restent consultables depuis la liste en
                haut de page.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Contrat clôturé : l'API refuse toute opération métier (409). Le
                dire ici évite de saisir un relevé entier pour rien. */}
            {selected.status === "CLOSED" && (
              <Notice icon={IconLock} className="mb-4">
                Contrat {selected.code} clôturé — lecture seule.{" "}
                <Link
                  to={`/contracts/${selected.id}`}
                  className="font-medium underline underline-offset-2 hover:text-brand-900"
                >
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
