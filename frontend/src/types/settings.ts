export interface Settings {
  auth_token: string | null;
  default_audio_format: string;
  default_name_format: string | null;
  music_root: string | null;
  auto_sync_enabled: boolean;
  auto_sync_interval_minutes: number;
  max_concurrent_syncs: number;
}

export type SettingsUpdate = Partial<Settings>;
