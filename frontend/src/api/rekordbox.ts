import { api } from "./client";

export interface RekordboxExportResult {
  tracks_added: number;
  tracks_skipped: number;
  xml_path: string;
  playlist_name?: string;
  playlist_tracks?: number;
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
  exportToCollection: (sourceId: number) =>
    api.post<RekordboxExportResult>(`/rekordbox/${sourceId}/collection`),
  exportAsPlaylist: (sourceId: number) =>
    api.post<RekordboxExportResult>(`/rekordbox/${sourceId}/playlist`),
  status: () => api.get<RekordboxStatus>("/rekordbox/status"),
  discover: () => api.get<{ detected_paths: string[] }>("/rekordbox/discover"),
};
