export interface Source {
  id: number;
  name: string;
  url: string;
  source_type: string;
  local_folder: string;
  audio_format: string;
  name_format: string | null;
  sync_enabled: boolean;
  original_art: boolean;
  extract_artist: boolean;
  created_at: string;
  updated_at: string;
  last_sync_status: string | null;
  last_sync_at: string | null;
}

export interface SourceCreate {
  name: string;
  url: string;
  source_type: string;
  local_folder: string;
  audio_format?: string;
  name_format?: string | null;
  sync_enabled?: boolean;
  original_art?: boolean;
  extract_artist?: boolean;
}

export type SourceUpdate = Partial<SourceCreate>;

export interface TrackFile {
  name: string;
  relative_path: string | null;
  size: number;
  modified_at: string | null;
  status: "synced" | "missing" | "untracked";
  track_id: string | null;
}
