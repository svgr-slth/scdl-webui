import { useMutation, useQuery } from "@tanstack/react-query";
import { rekordboxApi } from "../api/rekordbox";

export function useRekordboxStatus() {
  return useQuery({
    queryKey: ["rekordbox", "status"],
    queryFn: rekordboxApi.status,
  });
}

export function useExportToCollection() {
  return useMutation({
    mutationFn: (sourceId: number) => rekordboxApi.exportToCollection(sourceId),
  });
}

export function useExportAsPlaylist() {
  return useMutation({
    mutationFn: (sourceId: number) => rekordboxApi.exportAsPlaylist(sourceId),
  });
}
