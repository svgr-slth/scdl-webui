import { useMutation, useQuery } from "@tanstack/react-query";
import { rekordboxApi } from "../api/rekordbox";

export function useRekordboxStatus() {
  return useQuery({
    queryKey: ["rekordbox", "status"],
    queryFn: rekordboxApi.status,
  });
}

export function useExportToRekordbox() {
  return useMutation({
    mutationFn: (sourceId: number) => rekordboxApi.export(sourceId),
  });
}
