import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import UsersPage from "./pages/UsersPage";
import { isSessionValid } from "./lib/auth";
import { FEATURES } from "./lib/features";
import DashboardPage from "./pages/DashboardPage";
import ContractsPage from "./pages/ContractsPage";
import ContractDetailPage from "./pages/ContractDetailPage";
import ReceptionPage from "./pages/ReceptionPage";
import EtalagePage from "./pages/EtalagePage";
import DebitagePage from "./pages/DebitagePage";
import StockPage from "./pages/StockPage";
import VentesPage from "./pages/VentesPage";
import EmpotagePage from "./pages/EmpotagePage";
import ComptaPage from "./pages/ComptaPage";
import RapportPage from "./pages/RapportPage";
import TruckDetailPage from "./pages/TruckDetailPage";
import ProductionRunPage from "./pages/ProductionRunPage";

const queryClient = new QueryClient();

export default function App() {
  const [authed, setAuthed] = useState(() => isSessionValid());

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
