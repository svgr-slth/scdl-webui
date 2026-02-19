import { api, BASE_URL } from "./client";
import type { Source, SourceCreate, SourceUpdate, TrackFile } from "../types/source";

export const sourcesApi = {
  list: () => api.get<Source[]>("/sources"),
  get: (id: number) => api.get<Source>(`/sources/${id}`),
  create: (data: SourceCreate) => api.post<Source>("/sources", data),
  update: (id: number, data: SourceUpdate) => api.put<Source>(`/sources/${id}`, data),
  delete: (id: number, deleteFiles: boolean = false) =>
    api.delete(`/sources/${id}?delete_files=${deleteFiles}`),
  openFolder: (id: number) =>
    api.post<{ status: string; path: string }>(`/sources/${id}/open-folder`),
  tracks: (id: number) => api.get<TrackFile[]>(`/sources/${id}/tracks`),
  trackStreamUrl: (id: number, path: string) =>
    `${BASE_URL}/sources/${id}/tracks/stream?path=${encodeURIComponent(path)}`,
  deleteTrack: (id: number, path: string, trackId: string | null) => {
    const params = new URLSearchParams({ path });
    if (trackId) params.set("track_id", trackId);
    return api.delete(`/sources/${id}/tracks?${params}`);
  },
};
