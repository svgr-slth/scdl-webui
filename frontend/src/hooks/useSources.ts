import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sourcesApi } from "../api/sources";
import { syncApi } from "../api/sync";
import type { SourceCreate, SourceUpdate } from "../types/source";

export function useSources() {
  return useQuery({ queryKey: ["sources"], queryFn: sourcesApi.list });
}

export function useSource(id: number) {
  return useQuery({ queryKey: ["sources", id], queryFn: () => sourcesApi.get(id) });
}

export function useCreateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SourceCreate) => sourcesApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
}

export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: SourceUpdate }) => sourcesApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteFiles }: { id: number; deleteFiles: boolean }) =>
      sourcesApi.delete(id, deleteFiles),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
}

export function useOpenFolder() {
  return useMutation({
    mutationFn: (sourceId: number) => sourcesApi.openFolder(sourceId),
  });
}

export function useResetArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: number) => syncApi.resetArchive(sourceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
}
