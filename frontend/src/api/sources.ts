import { api } from "./client";
import type { Source, SourceCreate, SourceUpdate } from "../types/source";

export const sourcesApi = {
  list: () => api.get<Source[]>("/sources"),
  get: (id: number) => api.get<Source>(`/sources/${id}`),
  create: (data: SourceCreate) => api.post<Source>("/sources", data),
  update: (id: number, data: SourceUpdate) => api.put<Source>(`/sources/${id}`, data),
  delete: (id: number, deleteFiles: boolean = false) =>
    api.delete(`/sources/${id}?delete_files=${deleteFiles}`),
};
