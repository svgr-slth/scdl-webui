export interface Settings {
  auth_token: string | null;
  default_audio_format: string;
  default_name_format: string | null;
}

export type SettingsUpdate = Partial<Settings>;
