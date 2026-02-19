import { useState, useEffect, useCallback } from "react";
import { EventsOn, EventsOff } from "../wailsjs/runtime/runtime";
import { GetVersion, CheckForUpdate, DownloadAndInstall } from "../wailsjs/go/main/App";

export interface UpdateInfo {
  available: boolean;
  version: string;
  notes: string;
}

export interface UpdateProgress {
  phase: "download" | "installing" | "done" | "error";
  percent: number;
  message: string;
}

export function useUpdater() {
  const [currentVersion, setCurrentVersion] = useState("...");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const info = await CheckForUpdate();
      setUpdateInfo(info.available ? info : null);
    } catch {
      // Silently ignore network errors during update check
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    GetVersion().then(setCurrentVersion).catch(() => {});
    check();

    EventsOn("update:progress", (raw: string) => {
      try {
        setProgress(JSON.parse(raw) as UpdateProgress);
      } catch {
        /* ignore malformed events */
      }
    });

    return () => {
      EventsOff("update:progress");
    };
  }, []);

  const install = useCallback(() => {
    if (!updateInfo) return;
    setProgress(null);
    DownloadAndInstall(updateInfo.version).catch(() => {});
  }, [updateInfo]);

  const isInstalling = progress !== null && progress.phase !== "error" && progress.phase !== "done";

  return { currentVersion, updateInfo, progress, checking, check, install, isInstalling };
}
