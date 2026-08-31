import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

/**
 * État réseau, source unique : celui de react-query. C'est lui qui décide de
 * mettre les mutations en attente ; l'interface doit dire la même chose que le
 * comportement réel, pas ce que `navigator.onLine` croit de son côté.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true // rendu serveur / premier rendu : on suppose connecté
  );
}
