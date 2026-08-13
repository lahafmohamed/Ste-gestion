import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { USER_ROLE_LABELS } from "@ste/shared";
import { clearSession, getUser } from "../lib/auth";
import { buttonCls } from "./ui/Button";
import {
  IconBox,
  IconContainer,
  IconContract,
  IconDashboard,
  IconLedger,
  IconLogout,
  IconLogs,
  IconReport,
  IconSales,
  IconSaw,
  IconTruck,
  IconUsers,
  type IconProps,
} from "./icons";

type NavItem = { to: string; label: string; Icon: (p: IconProps) => JSX.Element; end: boolean };

const NAV: NavItem[] = [
  { to: "/", label: "Tableau de bord", Icon: IconDashboard, end: true },
  { to: "/contracts", label: "Contrats", Icon: IconContract, end: false },
  { to: "/reception", label: "Réception", Icon: IconTruck, end: false },
  { to: "/etalage", label: "Étalage", Icon: IconLogs, end: false },
  { to: "/debitage", label: "Débitage", Icon: IconSaw, end: false },
  { to: "/stock", label: "Stock", Icon: IconBox, end: false },
  // Masqué pour la première version en ligne — réactiver quand prêt
  // { to: "/ventes", label: "Ventes", Icon: IconSales, end: false },
  // { to: "/empotage", label: "Empotage", Icon: IconContainer, end: false },
  // { to: "/compta", label: "Comptabilité", Icon: IconLedger, end: false },
  // { to: "/rapport", label: "Rapport", Icon: IconReport, end: false },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/utilisateurs", label: "Utilisateurs", Icon: IconUsers, end: false },
];

function logout() {
  clearSession();
  window.location.href = "/";
}

function NavList({
  nav,
  user,
  onNavigate,
}: {
  nav: NavItem[];
  user: ReturnType<typeof getUser>;
  onNavigate?: () => void;
}) {
  return (
    <>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              // min-h-touch : cible tactile 44px (le drawer se navigue au pouce).
              `flex min-h-touch items-center gap-3 rounded-lg px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 active:bg-slate-200"
              }`
            }
          >
            <n.Icon className="shrink-0" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      {user && (
        <div className="mt-2 border-t border-slate-100 pt-3">
          <div className="px-2 text-sm font-medium text-slate-900">{user.name}</div>
          <div className="px-2 text-xs text-slate-400">{USER_ROLE_LABELS[user.role]}</div>
          <button
            onClick={logout}
            className="mt-2 flex min-h-touch w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-slate-100 active:bg-slate-200"
          >
            <IconLogout width={16} height={16} />
            Déconnexion
          </button>
        </div>
      )}
    </>
  );
}

export default function Layout() {
  const user = getUser();
  const nav = user?.role === "ADMIN" ? [...NAV, ...ADMIN_NAV] : NAV;
  const [menuOpen, setMenuOpen] = useState(false);
  // Sur /contracts, la page a déjà son propre bouton de création : deux boutons
  // pour la même action à quelques centimètres l'un de l'autre.
  const onContracts = useLocation().pathname === "/contracts";
  // Drawer ouvert : fond figé (sinon la page défile derrière le voile) + Échap.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      {/* Header STE — permanent, toutes tailles d'écran */}
      <header className="fixed inset-x-0 top-0 z-header flex h-header items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            className="-ml-2.5 rounded-lg p-2.5 text-slate-600 hover:bg-slate-100 active:bg-slate-200 md:hidden"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-ste.png" alt="STE — Sustainable Teck Exports" className="h-8 w-auto" />
            <span className="hidden text-sm text-slate-500 sm:inline">Gestion scierie</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {/* Icône seule sur mobile → le nom doit rester lisible au lecteur d'écran. */}
          <Link to="/contracts" aria-label="Contrats" className={buttonCls("secondary", "sm")}>
            <IconContract width={16} height={16} />
            <span className="hidden sm:inline">Contrats</span>
          </Link>
          {!onContracts && (
            <Link to="/contracts?nouveau=1" className={buttonCls("primary", "sm")}>
              + Contrat
            </Link>
          )}
          {user && (
            <button
              onClick={logout}
              aria-label="Déconnexion"
              className="ml-1 hidden items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 md:flex"
            >
              {user.name}
              <IconLogout width={16} height={16} />
            </button>
          )}
        </div>
      </header>

      {/* Sidebar desktop */}
      <aside className="fixed bottom-0 left-0 top-header hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <NavList nav={nav} user={user} />
      </aside>

      {/* Drawer mobile */}
      {/* aria-hidden fermé : le drawer hors écran reste dans le DOM (transition),
          il ne doit pas être exposé au lecteur d'écran. */}
      <div
        aria-hidden={!menuOpen}
        className={`fixed inset-0 z-overlay md:hidden ${menuOpen ? "" : "pointer-events-none"}`}
      >
        <div
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
          className={`absolute inset-0 bg-slate-900/40 transition-opacity duration-200 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-64 max-w-[80%] flex-col border-r border-slate-200 bg-white px-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))] pt-[calc(1rem_+_env(safe-area-inset-top))] shadow-xl transition-transform duration-200 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <img src="/logo-ste.png" alt="STE — Sustainable Teck Exports" className="h-7 w-auto" />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Fermer le menu"
              className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100 active:bg-slate-200"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
          <NavList nav={nav} user={user} onNavigate={() => setMenuOpen(false)} />
        </aside>
      </div>

      {/* Contenu */}
      <div className="pt-header md:pl-56">
        <main className="pb-[calc(1.5rem_+_env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// En-tête de page réutilisable (titre + sélecteur/actions à droite).
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
