import { api } from "./client";

export interface BrowseResult {
  current: string;
  parent: string | null;
  directories: { name: string; path: string }[];
}

export const filesystemApi = {
  browse: (path: string) => api.get<BrowseResult>(`/filesystem/browse?path=${encodeURIComponent(path)}`),
};
