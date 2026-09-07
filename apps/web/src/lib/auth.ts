import { useSyncExternalStore } from "react";
import type { Permission, UserDTO } from "@ste/shared";

const TOKEN_KEY = "ste.token";
const USER_KEY = "ste.user";

// Petit store : `setSession` / `clearSession` préviennent les abonnés, pour que
// l'en-tête et les gardes de routes se redessinent quand les permissions
// arrivent (rafraîchissement /auth/me au chargement) ou changent.
const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Décode l'exp du JWT (payload base64url) sans vérifier la signature.
function tokenExpMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Session valide = token présent et non expiré (nettoie si expiré). */
export function isSessionValid(): boolean {
  const t = getToken();
  if (!t) return false;
  const expMs = tokenExpMs(t);
  if (expMs !== null && Date.now() >= expMs) {
    clearSession();
    return false;
  }
  return true;
}

let cachedRaw: string | null | undefined;
let cachedUser: UserDTO | null = null;

// Même chaîne → même objet : useSyncExternalStore compare par référence.
export function getUser(): UserDTO | null {
  const raw = localStorage.getItem(USER_KEY);
  if (raw === cachedRaw) return cachedUser;
  cachedRaw = raw;
  try {
    cachedUser = raw ? (JSON.parse(raw) as UserDTO) : null;
  } catch {
    cachedUser = null;
  }
  return cachedUser;
}

/** Utilisateur courant, réactif (se met à jour après /auth/me ou déconnexion). */
export function useUser(): UserDTO | null {
  return useSyncExternalStore(subscribe, getUser, getUser);
}

function has(u: UserDTO | null, permission: Permission): boolean {
  if (!u) return false;
  if (u.role === "ADMIN") return true;
  return Array.isArray(u.permissions) && u.permissions.includes(permission);
}

/**
 * Permission effective de l'utilisateur courant. Une session d'avant la mise
 * en place des permissions n'a pas la liste : tout est refusé jusqu'au
 * rafraîchissement /auth/me lancé au chargement (App), ADMIN excepté.
 */
export function can(permission: Permission): boolean {
  return has(getUser(), permission);
}

/** Variante réactive de `can` pour les composants. */
export function useCan(): (permission: Permission) => boolean {
  const u = useUser();
  return (permission) => has(u, permission);
}

export function setSession(token: string, user: UserDTO) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

/** Met à jour l'utilisateur mémorisé sans toucher au token (retour de /auth/me). */
export function setSessionUser(user: UserDTO) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  notify();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notify();
  // Le service worker garde les réponses d'API en cache pour le mode hors
  // ligne. Sur une tablette partagée au parc, le pointeur suivant ne doit pas
  // pouvoir en ressortir les données du précédent : le cache part avec la
  // session. (Best-effort : `caches` n'existe pas hors contexte sécurisé.)
  void caches?.delete("ste-api").catch(() => {});
}
