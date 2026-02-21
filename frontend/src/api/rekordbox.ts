import { api } from "./client";

export interface RekordboxExportResult {
  tracks_added: number;
  tracks_skipped: number;
  playlist_updated: number;
  xml_path: string;
  playlist_name: string;
  is_rekordbox_running: boolean;
}

export interface RekordboxStatus {
  platform: string;
  xml_exists: boolean;
  xml_path: string;
  total_tracks: number;
  total_playlists: number;
  detected_paths: string[];
}

export const rekordboxApi = {
  export: (sourceId: number) =>
    api.post<RekordboxExportResult>(`/rekordbox/${sourceId}/export`),
  status: () => api.get<RekordboxStatus>("/rekordbox/status"),
  discover: () => api.get<{ detected_paths: string[] }>("/rekordbox/discover"),
};
