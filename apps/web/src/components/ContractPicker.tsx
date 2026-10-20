import type { ContractDTO } from "@ste/shared";
import SelectField from "./ui/SelectField";

type Props = {
  contracts: ContractDTO[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Libellé du « aucun » : « Tous les contrats » là où la vue globale existe. */
  emptyLabel?: string;
};

export default function ContractPicker({
  contracts,
  value,
  onChange,
  emptyLabel = "— Choisir —",
}: Props) {
  if (contracts.length === 0) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-brand-600">Contrat</span>
      <SelectField
        value={value ?? ""}
        onChange={(id) => onChange(id || null)}
        width="auto"
        aria-label="Contrat courant"
        placeholder={emptyLabel}
        options={contracts.map((c) => ({
          value: c.id,
          label: c.code,
          hint: c.status === "CLOSED" ? "clôturé" : undefined,
        }))}
      />
    </div>
  );
}
