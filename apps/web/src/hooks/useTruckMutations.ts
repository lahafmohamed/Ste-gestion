import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LogUpdateInput, MeasurementCreateInput } from "@ste/shared";
import { trucksApi } from "../lib/api";
import { clearTallyDraft } from "../lib/tallyDraft";

/**
 * Mutations du détail camion (relevés, lignes, écart de comptage, suppression)
 * avec leurs deux canaux d'erreur :
 * - `measError` : échec d'un relevé, mémorisé par saisie (contexte, et ajout ou
 *   non) pour afficher le message contre le bon bouton Valider — sans retour
 *   visible, « Enregistrement… » s'éteint et la saisie paraît enregistrée.
 * - `opError` : échec d'une opération ponctuelle (suppression, correction,
 *   confirmation d'écart) affiché en bandeau de page.
 */
export function useTruckMutations(id: string, onTruckDeleted: () => void) {
  const qc = useQueryClient();

  function refresh() {
    qc.invalidateQueries({ queryKey: ["trucks"] });
    qc.invalidateQueries({ queryKey: ["summary"] });
    qc.invalidateQueries({ queryKey: ["suggestions"] });
  }

  const [measError, setMeasError] = useState<{ key: string; message: string } | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  const addMeasurement = useMutation({
    mutationFn: (data: MeasurementCreateInput) => trucksApi.addMeasurement(id, data),
    onSuccess: (_m, vars) => {
      clearTallyDraft(`${id}:${vars.context}`);
      setMeasError(null);
      refresh();
    },
    onError: (e: Error, vars) => setMeasError({ key: vars.context, message: e.message }),
  });

  const appendMeasurement = useMutation({
    mutationFn: ({
      measurementId,
      data,
    }: {
      measurementId: string;
      data: MeasurementCreateInput;
    }) => trucksApi.appendMeasurement(measurementId, data),
    onSuccess: (_m, vars) => {
      clearTallyDraft(`${id}:${vars.data.context}:append`);
      setMeasError(null);
      refresh();
    },
    onError: (e: Error, vars) =>
      setMeasError({ key: `${vars.data.context}:append`, message: e.message }),
  });

  const delMeasurement = useMutation({
    mutationFn: trucksApi.removeMeasurement,
    onSuccess: () => {
      setOpError(null);
      refresh();
    },
    onError: (e: Error) => setOpError(e.message),
  });

  // Correction / suppression d'une ligne enregistrée (erreur de saisie au parc).
  const updateLog = useMutation({
    mutationFn: ({ logId, data }: { logId: string; data: LogUpdateInput }) =>
      trucksApi.updateLog(logId, data),
    onSuccess: () => {
      setOpError(null);
      refresh();
    },
    onError: (e: Error) => setOpError(e.message),
  });

  const delLog = useMutation({
    mutationFn: trucksApi.removeLog,
    onSuccess: () => {
      setOpError(null);
      refresh();
    },
    onError: (e: Error) => setOpError(e.message),
  });

  const confirmGap = useMutation({
    mutationFn: (v: boolean) => trucksApi.update(id, { countGapConfirmed: v }),
    onSuccess: () => {
      setOpError(null);
      refresh();
    },
    onError: (e: Error) => setOpError(e.message),
  });

  // En cas d'échec, seul `opError` est posé — le retour UI (fermer le dialogue
  // de confirmation…) est à fournir par l'appelant via `mutate(…, { onError })`.
  const delTruck = useMutation({
    mutationFn: () => trucksApi.remove(id),
    onSuccess: () => {
      refresh();
      onTruckDeleted();
    },
    onError: (e: Error) => setOpError(e.message),
  });

  return {
    addMeasurement,
    appendMeasurement,
    delMeasurement,
    updateLog,
    delLog,
    confirmGap,
    delTruck,
    measError,
    opError,
  };
}
