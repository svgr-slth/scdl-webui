import { api } from "./client";
import type { SyncRun, SyncRunDetail } from "../types/sync";

export const historyApi = {
  list: (sourceId?: number, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (sourceId) params.set("source_id", String(sourceId));
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return api.get<SyncRun[]>(`/history?${params}`);
  },
  get: (runId: number) => api.get<SyncRunDetail>(`/history/${runId}`),
};
