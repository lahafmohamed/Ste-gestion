import type { UserDTO } from "@ste/shared";

const TOKEN_KEY = "ste.token";
const USER_KEY = "ste.user";

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

export function getUser(): UserDTO | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserDTO;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: UserDTO) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
