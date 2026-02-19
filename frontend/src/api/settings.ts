import { api } from "./client";
import type { Settings, SettingsUpdate } from "../types/settings";

export interface MoveCheckResult {
  needs_move: boolean;
  source_count: number;
  total_files: number;
  total_size: number;
}

export const settingsApi = {
  get: () => api.get<Settings>("/settings"),
  update: (data: SettingsUpdate) => api.put<Settings>("/settings", data),
  moveCheck: (newMusicRoot: string) =>
    api.get<MoveCheckResult>(
      `/settings/move-check?new_music_root=${encodeURIComponent(newMusicRoot)}`
    ),
  moveLibrary: (musicRoot: string) =>
    api.post<{ status: string }>("/settings/move-library", {
      music_root: musicRoot,
    }),
};
