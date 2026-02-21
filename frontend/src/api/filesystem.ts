import { api } from "./client";

export interface BrowseResult {
  current: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  files: { name: string; path: string }[];
}

export const filesystemApi = {
  browse: (path: string, fileGlob?: string) => {
    let url = `/filesystem/browse?path=${encodeURIComponent(path)}`;
    if (fileGlob) url += `&file_glob=${encodeURIComponent(fileGlob)}`;
    return api.get<BrowseResult>(url);
  },
};
