import type { ContractDTO } from "@ste/shared";

type Props = {
  contracts: ContractDTO[];
  value: string | null;
  onChange: (id: string) => void;
};

export default function ContractPicker({ contracts, value, onChange }: Props) {
  if (contracts.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-brand-500">Contrat</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        // 16px : sous ce seuil, iOS zoome la page au focus du select.
        className="min-h-touch rounded-lg border border-brand-300 px-3 py-1.5 text-base outline-none focus:border-brand-900"
      >
        {contracts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} {c.status === "CLOSED" ? "(clôturé)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
