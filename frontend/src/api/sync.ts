import { api } from "./client";
import type { SyncStatus } from "../types/sync";

export const syncApi = {
  trigger: (sourceId: number) => api.post<{ status: string }>(`/sync/${sourceId}`),
  triggerAll: () => api.post<{ status: string; count: number }>("/sync/all"),
  cancel: (sourceId: number) => api.post<{ status: string }>(`/sync/${sourceId}/cancel`),
  status: () => api.get<SyncStatus>("/sync/status"),
  sourceStatus: (sourceId: number) => api.get<{ is_syncing: boolean }>(`/sync/${sourceId}/status`),
};
