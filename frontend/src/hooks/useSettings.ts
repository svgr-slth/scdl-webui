import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../api/settings";
import type { SettingsUpdate } from "../types/settings";

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: settingsApi.get });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SettingsUpdate) => settingsApi.update(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
}
