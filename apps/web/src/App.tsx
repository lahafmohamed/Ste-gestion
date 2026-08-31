import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import UsersPage from "./pages/UsersPage";
import { authApi } from "./lib/api";
import { isSessionValid, setSession } from "./lib/auth";
import { FEATURES } from "./lib/features";
import DashboardPage from "./pages/DashboardPage";
import ContractsPage from "./pages/ContractsPage";
import ContractDetailPage from "./pages/ContractDetailPage";
import ReceptionPage from "./pages/ReceptionPage";
import CamionsPage from "./pages/CamionsPage";
import EtalagePage from "./pages/EtalagePage";
import DebitagePage from "./pages/DebitagePage";
import StockPage from "./pages/StockPage";
import VentesPage from "./pages/VentesPage";
import EmpotagePage from "./pages/EmpotagePage";
import ComptaPage from "./pages/ComptaPage";
import RapportPage from "./pages/RapportPage";
import TruckDetailPage from "./pages/TruckDetailPage";
import ProductionRunPage from "./pages/ProductionRunPage";

// Réglages pensés pour le terrain : tablette au parc, réseau lent et coupé.
// - staleTime 30 s : revenir sur une page déjà vue ne refait pas la requête et
//   ne reflashe pas les squelettes ; le retour sur l'onglet ne déclenche un
//   rafraîchissement que si la donnée a plus de 30 s.
// - retry 2 (backoff) : une coupure brève se rattrape seule.
// - mutations : AUCUN retry. Un POST de relevé rejoué en aveugle crée des
//   doublons de billons ; l'échec remonte au pointeur, le brouillon est gardé.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // offlineFirst : hors réseau, react-query lance quand même la requête —
      // le service worker y répond depuis son cache (NetworkFirst). Avec le
      // mode par défaut, la requête serait mise en pause sans jamais partir et
      // l'app rouverte au parc n'afficherait que des squelettes.
      networkMode: "offlineFirst",
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    // Mutations en mode « online » (défaut, explicite ici) : hors réseau elles
    // sont mises en attente et repartent seules au retour de la connexion.
    mutations: { networkMode: "online", retry: 0 },
  },
});

export default function App() {
  const [authed, setAuthed] = useState(() => isSessionValid());

  // Dev uniquement : connexion automatique avec l'admin du seed pour éviter le
  // formulaire à chaque rechargement. La branche est éliminée du build de prod
  // (import.meta.env.DEV → false), les identifiants ne partent jamais en ligne.
  useEffect(() => {
    if (!import.meta.env.DEV || authed) return;
    const email = import.meta.env.VITE_DEV_LOGIN_EMAIL ?? "admin@local";
    const password = import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? "admin123";
    authApi
      .login({ email, password })
      .then((res) => {
        setSession(res.token, res.user);
        setAuthed(true);
      })
      .catch(() => {
        // Identifiants dev invalides : le formulaire de connexion reste affiché.
      });
  }, [authed]);

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/contracts/:id" element={<ContractDetailPage />} />
            <Route path="/reception" element={<ReceptionPage />} />
            <Route path="/camions" element={<CamionsPage />} />
            <Route path="/etalage" element={<EtalagePage />} />
            <Route path="/debitage" element={<DebitagePage />} />
            <Route path="/stock" element={<StockPage />} />
            {FEATURES.sales && <Route path="/ventes" element={<VentesPage />} />}
            <Route path="/empotage" element={<EmpotagePage />} />
            {FEATURES.accounting && <Route path="/compta" element={<ComptaPage />} />}
            {FEATURES.report && <Route path="/rapport" element={<RapportPage />} />}
            <Route path="/utilisateurs" element={<UsersPage />} />
            <Route path="/trucks/:id" element={<TruckDetailPage />} />
            <Route path="/production-runs/:id" element={<ProductionRunPage />} />
            {/* Sans quoi un favori vers un module en veille (/ventes, /compta,
                /rapport) affiche le chrome de l'app autour d'un vide. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
