import type { Ref } from "react";
import { Link } from "react-router-dom";
import type { VehicleDTO } from "@ste/shared";
import Input, { Field } from "./ui/Input";
import SelectField from "./ui/SelectField";

// Au portail, ce sont toujours les mêmes camions qui reviennent : l'immat se
// choisit dans le parc au lieu d'être retapée (une frappe = une variante
// d'écriture de plus, et deux camions là où il n'y en a qu'un).
//
// Le choix « autre camion » garde la porte ouverte : un camion inconnu se
// saisit à la main et rejoint le parc tout seul (voir resolveVehicle côté API).

/** Valeur du choix « pas dans la liste » — bascule sur la saisie libre. */
export const VEHICLE_NEW = "__new__";

export type VehiclePickerValue = { vehicleId: string; registration: string };

export default function VehiclePicker({
  vehicles,
  loading = false,
  vehicleId,
  registration,
  onChange,
  disabled,
  inputRef,
}: {
  vehicles: VehicleDTO[];
  loading?: boolean;
  /** id du camion choisi, `VEHICLE_NEW` en saisie libre, `""` si rien choisi. */
  vehicleId: string;
  registration: string;
  onChange: (next: VehiclePickerValue) => void;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  // Camions retirés du parc : hors du choix, sauf celui déjà sélectionné (un
  // formulaire ne doit jamais perdre en silence ce qui y était).
  const options = vehicles.filter((v) => v.active || v.id === vehicleId);
  const picked = vehicles.find((v) => v.id === vehicleId) ?? null;
  const manual = vehicleId === VEHICLE_NEW;

  // Parc encore vide (ou en cours de chargement) : rien à choisir — la saisie
  // libre est le seul chemin, et le camion saisi amorcera le parc.
  if (loading || options.length === 0) {
    return (
      <Field label="Immatriculation">
        <Input
          ref={inputRef}
          required
          disabled={disabled}
          value={registration}
          onChange={(e) => onChange({ vehicleId: VEHICLE_NEW, registration: e.target.value })}
          placeholder="3201 GS 01"
        />
      </Field>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Camion">
        <SelectField
          value={vehicleId}
          disabled={disabled}
          placeholder="— Choisir le camion —"
          aria-label="Camion du parc"
          onChange={(id) =>
            onChange({
              vehicleId: id,
              // L'immat suit le camion choisi : c'est elle qui part sur le
              // bordereau et qui sert aux contrôles de doublon.
              registration: id === VEHICLE_NEW ? "" : (vehicles.find((v) => v.id === id)?.registration ?? ""),
            })
          }
          options={[
            ...options.map((v) => ({
              value: v.id,
              label: v.registration,
              hint: v.active ? (v.code ?? undefined) : "retiré",
            })),
            { value: VEHICLE_NEW, label: "Autre camion — saisir l'immatriculation" },
          ]}
        />
      </Field>

      {/* Camion inconnu : saisie libre, ajouté au parc à l'enregistrement. */}
      {manual && (
        <Field label="Immatriculation du nouveau camion">
          <Input
            ref={inputRef}
            required
            disabled={disabled}
            value={registration}
            onChange={(e) => onChange({ vehicleId: VEHICLE_NEW, registration: e.target.value })}
            placeholder="3201 GS 01"
          />
        </Field>
      )}

      {/* Ce que le camion apporte au bordereau — visible avant d'enregistrer. */}
      {picked && (picked.driver || picked.trailer) && (
        <p className="text-sm text-brand-500">
          {[picked.driver, picked.trailer && `remorque ${picked.trailer}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {manual && (
        <p className="text-sm text-brand-500">
          Ce camion rejoint le parc —{" "}
          <Link to="/camions" className="underline hover:text-brand-900">
            Camions
          </Link>{" "}
          pour y ajouter son code et son chauffeur.
        </p>
      )}
    </div>
  );
}
