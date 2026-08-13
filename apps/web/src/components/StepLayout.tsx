import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { ContractDTO } from "@ste/shared";
import { useSelectedContract } from "../hooks/useSelectedContract";
import ContractPicker from "./ContractPicker";
import { PageHeader } from "./Layout";
import { SkeletonList } from "./ui/Skeleton";

// Chaîne de travail visible : chaque page d'étape sait où elle se situe dans le
// flux Réception → Étalage → Débitage → Stock, et saute à l'étape voisine d'un
// tap (le poste change, le contrat sélectionné reste).
const STEPS = [
  { key: "reception", to: "/reception", label: "Réception" },
  { key: "etalage", to: "/etalage", label: "Étalage" },
  { key: "debitage", to: "/debitage", label: "Débitage" },
  { key: "stock", to: "/stock", label: "Stock" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];

function StepChain({ current }: { current: StepKey }) {
  return (
    <nav
      aria-label="Étapes du flux"
      className="-mx-4 mb-4 flex items-center gap-1 overflow-x-auto px-4 scrollbar-none"
    >
      {STEPS.map((s, i) => (
        <span key={s.key} className="flex shrink-0 items-center gap-1">
          {i > 0 && <span className="text-slate-300">→</span>}
          <Link
            to={s.to}
            aria-current={s.key === current ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              s.key === current
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-500 ring-1 ring-slate-200 hover:ring-slate-400 active:bg-slate-100"
            }`}
          >
            <span className="tabular-nums opacity-60">{i + 1}</span>
            {s.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

type Props = {
  title: string;
  subtitle?: string;
  /** Étape du flux parc — affiche la chaîne 1→4 en tête de page. */
  step?: StepKey;
  children: (contract: ContractDTO) => ReactNode;
};

export default function StepLayout({ title, subtitle, step, children }: Props) {
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
      <div className="mx-auto max-w-page px-4 py-6">
        {step && <StepChain current={step} />}
        {isLoading ? (
          <SkeletonList count={2} />
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
