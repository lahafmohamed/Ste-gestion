import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { USER_ROLE_LABELS } from "@ste/shared";
import { clearSession, getUser } from "../lib/auth";
import { FEATURES } from "../lib/features";
import { buttonCls } from "./ui/Button";
import { OfflineBanner, UpdateBanner } from "./AppBanners";
import {
  IconBox,
  IconContainer,
  IconContract,
  IconDashboard,
  IconFleet,
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

type NavEntry = NavItem & { enabled?: boolean };

const NAV: NavItem[] = (
  [
    { to: "/", label: "Tableau de bord", Icon: IconDashboard, end: true },
    { to: "/contracts", label: "Contrats", Icon: IconContract, end: false },
    { to: "/reception", label: "Réception", Icon: IconTruck, end: false },
    { to: "/etalage", label: "Étalage", Icon: IconLogs, end: false },
    { to: "/debitage", label: "Débitage", Icon: IconSaw, end: false },
    { to: "/stock", label: "Stock", Icon: IconBox, end: false },
    { to: "/ventes", label: "Ventes", Icon: IconSales, end: false, enabled: FEATURES.sales },
    { to: "/empotage", label: "Empotage", Icon: IconContainer, end: false },
    // Référentiel, hors chaîne de production : rangé après les postes.
    { to: "/camions", label: "Camions", Icon: IconFleet, end: false },
    {
      to: "/compta",
      label: "Comptabilité",
      Icon: IconLedger,
      end: false,
      enabled: FEATURES.accounting,
    },
    { to: "/rapport", label: "Rapport", Icon: IconReport, end: false, enabled: FEATURES.report },
  ] satisfies NavEntry[]
).filter((n) => n.enabled !== false);

const ADMIN_NAV: NavItem[] = [
  { to: "/utilisateurs", label: "Utilisateurs", Icon: IconUsers, end: false },
];

function logout() {
  clearSession();
  window.location.href = "/";
}

/** Initiales du compte — pastille d'identité dans l'en-tête et le drawer. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 select-none items-center justify-center rounded-full bg-accent-500 font-semibold text-white shadow-btn ${
        size === "md" ? "size-10 text-sm" : "size-7 text-[11px]"
      }`}
    >
      {initials(name)}
    </span>
  );
}

// Liste verticale (drawer) : la ligne active est une pastille teck claire, son
// icône prend l'accent. Même vocabulaire que les onglets de l'en-tête.
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
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              // min-h-touch : cible tactile 44px (le drawer se navigue au pouce).
              `flex min-h-touch items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${
                isActive
                  ? "bg-accent-100/70 text-accent-800"
                  : "text-brand-600 hover:bg-brand-100 hover:text-brand-900 active:bg-brand-200"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <n.Icon
                  width={20}
                  height={20}
                  className={`shrink-0 ${isActive ? "text-accent-600" : "text-brand-400"}`}
                />
                {n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {user && (
        <div className="mt-2 border-t border-brand-100 pt-3">
          <div className="flex items-center gap-3 px-2">
            <Avatar name={user.name} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-brand-900">{user.name}</div>
              <div className="truncate text-xs text-brand-500">{USER_ROLE_LABELS[user.role]}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-2 flex min-h-touch w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-500 transition-colors hover:bg-brand-100 hover:text-brand-900 active:bg-brand-200"
          >
            <IconLogout width={20} height={20} className="text-brand-400" />
            Déconnexion
          </button>
        </div>
      )}
    </>
  );
}

// Onglets de navigation principaux — dans l'en-tête, sur la ligne du logo, à
// partir de lg. En dessous c'est le drawer qui porte la navigation : les neuf
// postes ne tiennent pas à côté de la marque et des actions sans défiler.
// Entre lg et xl seules les icônes s'affichent (le libellé reste pour le
// lecteur d'écran et en info-bulle) ; à partir de xl les libellés reviennent.
// `className` porte le display : deux utilitaires de display dans la même
// classe ne se départageraient pas de façon fiable.
function NavTabs({ nav, className }: { nav: NavItem[]; className: string }) {
  return (
    <nav
      className={`scrollbar-none items-center gap-0.5 overflow-x-auto ${className}`}
      aria-label="Navigation principale"
    >
      {nav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          title={n.label}
          className={({ isActive }) =>
            `flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${
              isActive
                ? "bg-accent-100/70 text-accent-800"
                : "text-brand-600 hover:bg-brand-100 hover:text-brand-900 active:bg-brand-200"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <n.Icon
                width={20}
                height={20}
                className={`shrink-0 ${isActive ? "text-accent-600" : "text-brand-400"}`}
              />
              <span className="sr-only xl:not-sr-only">{n.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// Actions du compte repliées derrière un seul déclencheur — c'est ce qui rend
// à la navigation la largeur qu'elles occupaient sur la ligne du logo.
// « + Contrat » reste dehors : c'est l'action que le bureau répète, l'enterrer
// d'un cran la punirait.
function ActionsMenu({ user }: { user: ReturnType<typeof getUser> }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Échap et clic dehors referment ; le focus revient au déclencheur, sinon il
  // repart au début du document et la tabulation recommence tout l'en-tête.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const itemCls =
    "flex min-h-touch w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 hover:text-brand-900 active:bg-brand-200";

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        // Le nom disparaît sous md : le libellé accessible doit rester, lui.
        aria-label={user ? `Menu de ${user.name}` : "Menu"}
        className={`flex min-h-touch items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:bg-brand-200 ${
          open ? "bg-brand-100" : ""
        }`}
      >
        {user ? <Avatar name={user.name} /> : null}
        <span className="hidden max-w-[8rem] truncate md:inline">{user?.name ?? "Compte"}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`size-4 shrink-0 text-brand-400 transition-transform duration-150 ease-out ${
            open ? "-rotate-180" : ""
          }`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Actions du compte"
          className="absolute right-0 top-full z-overlay mt-2 w-60 origin-top-right rounded-2xl bg-white p-2 shadow-popover motion-safe:animate-pop-in"
        >
          {user && (
            <div className="mb-1 flex items-center gap-3 border-b border-brand-100 px-2 pb-3 pt-1.5">
              <Avatar name={user.name} size="md" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-brand-900">{user.name}</div>
                <div className="truncate text-xs text-brand-500">
                  {USER_ROLE_LABELS[user.role]}
                </div>
              </div>
            </div>
          )}
          <Link to="/contracts" role="menuitem" onClick={() => setOpen(false)} className={itemCls}>
            <IconContract width={18} height={18} className="text-brand-400" />
            Contrats
          </Link>
          {user && (
            <button type="button" role="menuitem" onClick={logout} className={itemCls}>
              <IconLogout width={18} height={18} className="text-brand-400" />
              Déconnexion
            </button>
          )}
        </div>
      )}
    </div>
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
    <div className="min-h-dvh bg-ground text-brand-900">
      {/* En-tête STE — une seule rangée, à toutes les tailles d'écran :
          marque, navigation des postes (à partir de lg), actions. Blanc
          translucide + flou : la page glisse dessous sans trait dur. */}
      <header className="fixed inset-x-0 top-0 z-header flex h-header items-center gap-2 bg-white/85 px-4 shadow-header backdrop-blur-md short:h-header-sm">
        <div className="flex shrink-0 items-center gap-1">
          {/* Sous lg, la navigation vit dans le drawer : c'est ce bouton qui l'ouvre. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen}
            className="-ml-2.5 rounded-lg p-2.5 text-brand-600 transition-colors hover:bg-brand-100 active:bg-brand-200 lg:hidden"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          {/* Marque compacte : le logo complet (filets + tagline) est illisible
              à 32px. Sans mot-repère à côté — la largeur qu'il prenait revient
              à la navigation, et le logo dit déjà STE. */}
          <Link
            to="/"
            className="flex items-center rounded-lg px-1 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
          >
            <img src="/logo-ste-mark.png" alt="STE — Sustainable Teck Exports" className="h-6 w-auto" />
          </Link>
        </div>

        {/* flex-1 + min-w-0 : la nav prend la place restante et défile (barre
            masquée) plutôt que de pousser les actions hors de l'écran. */}
        <NavTabs nav={nav} className="ml-3 hidden min-w-0 flex-1 lg:flex" />

        {/* ml-auto sous lg : sans la nav pour occuper le milieu, les actions
            doivent être poussées à droite elles-mêmes. */}
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
          {!onContracts && (
            <Link to="/contracts?nouveau=1" className={buttonCls("primary", "sm")}>
              <span aria-hidden className="-ml-0.5 text-base leading-none">+</span>
              Contrat
            </Link>
          )}
          <ActionsMenu user={user} />
        </div>
      </header>

      {/* Drawer mobile (sous lg — même seuil que le bouton qui l'ouvre) */}
      {/* aria-hidden fermé : le drawer hors écran reste dans le DOM (transition),
          il ne doit pas être exposé au lecteur d'écran. */}
      <div
        aria-hidden={!menuOpen}
        className={`fixed inset-0 z-overlay lg:hidden ${menuOpen ? "" : "pointer-events-none"}`}
      >
        <div
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
          className={`absolute inset-0 bg-brand-950/50 backdrop-blur-[2px] transition-opacity duration-200 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white px-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))] pt-[calc(0.75rem_+_env(safe-area-inset-top))] shadow-dialog transition-transform duration-200 ease-out ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-3 flex items-center justify-between px-1">
            <img src="/logo-ste-mark.png" alt="STE — Sustainable Teck Exports" className="h-5 w-auto" />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Fermer le menu"
              className="rounded-lg p-2.5 text-brand-500 transition-colors hover:bg-brand-100 active:bg-brand-200"
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
      <div className="pt-header short:pt-header-sm">
        {/* État réseau et mise à jour : sous l'en-tête fixe, au-dessus de la
            page — jamais par-dessus la zone de saisie. */}
        <UpdateBanner />
        <OfflineBanner />
        <main className="pb-[calc(2rem_+_env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// En-tête de page (titre + sélecteur/actions à droite). Dans la colonne de
// contenu, sur le fond papier : plus de bandeau blanc sous l'en-tête fixe —
// deux barres empilées alourdissaient chaque page.
export function PageHeader({
  title,
  subtitle,
  right,
  wide = true,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Colonne large (72rem) — même largeur que le contenu qui suit. */
  wide?: boolean;
}) {
  return (
    <div
      className={`mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 pt-6 short:pt-3 ${
        wide ? "max-w-page-wide" : "max-w-page"
      }`}
    >
      <div className="min-w-0">
        <h1 className="text-title font-semibold tracking-tight text-brand-900">{title}</h1>
        {/* Téléphone en paysage : le sous-titre coûte une ligne de saisie. */}
        {subtitle && <p className="mt-0.5 text-sm text-brand-500 short:hidden">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
