export interface Settings {
  auth_token: string | null;
  default_audio_format: string;
  default_name_format: string | null;
  music_root: string;
}

export type SettingsUpdate = Partial<Settings>;
