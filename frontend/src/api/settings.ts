import { api } from "./client";
import type { Settings, SettingsUpdate } from "../types/settings";

export const settingsApi = {
  get: () => api.get<Settings>("/settings"),
  update: (data: SettingsUpdate) => api.put<Settings>("/settings", data),
};
