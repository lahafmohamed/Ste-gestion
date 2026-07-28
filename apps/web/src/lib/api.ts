import type {
  AccountEntryCreateInput,
  AccountEntryDTO,
  AccountSuggestionDTO,
  ContractAccountDTO,
  ContractDTO,
  ContractCreateInput,
  ContainerCreateInput,
  ContainerDTO,
  ContainerItemsAddInput,
  ContainerUpdateInput,
  ContractOverviewDTO,
  ContractSummaryDTO,
  ContractUpdateInput,
  DailyReportDTO,
  LoginInput,
  LoginResponse,
  TruckStatDTO,
  UserCreateInput,
  UserDTO,
  UserUpdateInput,
  PartyCreateInput,
  PartyDTO,
  MeasurementCreateInput,
  MeasurementDTO,
  PackingCreateInput,
  TruckUpdateInput,
  ContractCuttingDTO,
  ProductionRunCreateInput,
  ProductionRunDTO,
  SaleCreateInput,
  SaleDTO,
  TruckCreateInput,
  TruckDTO,
} from "@ste/shared";

import { clearSession, getToken } from "./auth";

const BASE = "/api";

async function req<T>(
  path: string,
  init?: RequestInit,
  opts?: { authRedirect?: boolean }
): Promise<T> {
  const token = getToken();
  // Content-Type JSON seulement si body présent : un DELETE sans body + en-tête
  // application/json déclenche FST_ERR_CTP_EMPTY_JSON_BODY (400) côté Fastify.
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(init?.body != null ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 401 && opts?.authRedirect !== false) {
    clearSession();
    window.location.href = "/";
    throw new Error("Session expirée");
  }
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.error === "string") msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Télécharge un fichier authentifié (blob → clic). */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const authApi = {
  login: (data: LoginInput) =>
    req<LoginResponse>(
      "/auth/login",
      { method: "POST", body: JSON.stringify(data) },
      { authRedirect: false }
    ),
  me: () => req<UserDTO>("/auth/me"),
};

export const usersApi = {
  list: () => req<UserDTO[]>("/users"),
  create: (data: UserCreateInput) =>
    req<UserDTO>("/users", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: UserUpdateInput) =>
    req<UserDTO>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const contractsApi = {
  list: () => req<ContractDTO[]>("/contracts"),
  get: (id: string) => req<ContractDTO>(`/contracts/${id}`),
  create: (data: ContractCreateInput) =>
    req<ContractDTO>("/contracts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: ContractUpdateInput) =>
    req<ContractDTO>(`/contracts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  remove: (id: string) =>
    req<void>(`/contracts/${id}`, { method: "DELETE" }),
  /** Vue liste de tous les contrats en une requête (voir ContractOverviewDTO). */
  overview: () => req<ContractOverviewDTO[]>("/contracts/overview"),
  summary: (id: string) => req<ContractSummaryDTO>(`/contracts/${id}/summary`),
  truckStats: (id: string) => req<TruckStatDTO[]>(`/contracts/${id}/truck-stats`),
  dailyReport: (id: string, date: string) =>
    req<DailyReportDTO>(`/contracts/${id}/daily-report?date=${date}`),
};

export const trucksApi = {
  listByContract: (contractId: string) =>
    req<TruckDTO[]>(`/trucks?contractId=${encodeURIComponent(contractId)}`),
  get: (id: string) => req<TruckDTO>(`/trucks/${id}`),
  create: (data: TruckCreateInput) =>
    req<TruckDTO>("/trucks", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: TruckUpdateInput) =>
    req<TruckDTO>(`/trucks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => req<void>(`/trucks/${id}`, { method: "DELETE" }),
  addMeasurement: (truckId: string, data: MeasurementCreateInput) =>
    req<MeasurementDTO>(`/trucks/${truckId}/measurements`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  appendMeasurement: (measurementId: string, data: MeasurementCreateInput) =>
    req<MeasurementDTO>(`/measurements/${measurementId}/logs`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  removeMeasurement: (id: string) =>
    req<void>(`/measurements/${id}`, { method: "DELETE" }),
  setPacking: (truckId: string, data: PackingCreateInput) =>
    req<TruckDTO>(`/trucks/${truckId}/packing`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  clearPacking: (truckId: string) =>
    req<void>(`/trucks/${truckId}/packing`, { method: "DELETE" }),
};

export const accountsApi = {
  parties: () => req<PartyDTO[]>("/parties"),
  createParty: (data: PartyCreateInput) =>
    req<PartyDTO>("/parties", { method: "POST", body: JSON.stringify(data) }),
  byContract: (contractId: string) =>
    req<ContractAccountDTO[]>(`/contracts/${contractId}/accounts`),
  addEntry: (data: AccountEntryCreateInput) =>
    req<AccountEntryDTO>("/account-entries", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  removeEntry: (id: string) =>
    req<void>(`/account-entries/${id}`, { method: "DELETE" }),
  suggestions: (contractId: string) =>
    req<AccountSuggestionDTO[]>(`/contracts/${contractId}/account-suggestions`),
};

export const salesApi = {
  listByContract: (contractId: string) =>
    req<SaleDTO[]>(`/sales?contractId=${encodeURIComponent(contractId)}`),
  get: (id: string) => req<SaleDTO>(`/sales/${id}`),
  create: (data: SaleCreateInput) =>
    req<SaleDTO>("/sales", { method: "POST", body: JSON.stringify(data) }),
  remove: (id: string) => req<void>(`/sales/${id}`, { method: "DELETE" }),
};

export const containersApi = {
  listByContract: (contractId: string) =>
    req<ContainerDTO[]>(`/containers?contractId=${encodeURIComponent(contractId)}`),
  get: (id: string) => req<ContainerDTO>(`/containers/${id}`),
  create: (data: ContainerCreateInput) =>
    req<ContainerDTO>("/containers", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: ContainerUpdateInput) =>
    req<ContainerDTO>(`/containers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  remove: (id: string) => req<void>(`/containers/${id}`, { method: "DELETE" }),
  addItems: (id: string, data: ContainerItemsAddInput) =>
    req<ContainerDTO>(`/containers/${id}/items`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  removeItem: (id: string) =>
    req<void>(`/container-items/${id}`, { method: "DELETE" }),
};

export const productionApi = {
  listByContract: (contractId: string) =>
    req<ProductionRunDTO[]>(
      `/production-runs?contractId=${encodeURIComponent(contractId)}`
    ),
  get: (id: string) => req<ProductionRunDTO>(`/production-runs/${id}`),
  create: (data: ProductionRunCreateInput) =>
    req<ProductionRunDTO>("/production-runs", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  remove: (id: string) => req<void>(`/production-runs/${id}`, { method: "DELETE" }),
  cutting: (contractId: string) =>
    req<ContractCuttingDTO>(`/contracts/${contractId}/cutting`),
};
