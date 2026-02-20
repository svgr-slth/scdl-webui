import { useEffect, useRef, useState, useCallback } from "react";
import type { WsMessage } from "../types/sync";
import { EventsOn, EventsOff } from "../wailsjs/runtime/runtime";
import { WatchSync, StopWatchSync } from "../wailsjs/go/main/App";

export interface SyncState {
  status: string;
  progress: { current: number; total: number } | null;
  error: string | null;
}

/**
 * Manages WebSocket connections for multiple sources simultaneously.
 * Each source gets its own connection and independent state.
 */
export function useMultiSyncWebSocket(sourceIds: number[]) {
  const [states, setStates] = useState<Record<number, SyncState>>({});
  const connectionsRef = useRef<Record<number, () => void>>({});
  const isWails = typeof (window as any).runtime !== "undefined";

  const updateSource = useCallback((sourceId: number, updater: (prev: SyncState) => SyncState) => {
    setStates((prev) => ({
      ...prev,
      [sourceId]: updater(prev[sourceId] ?? { status: "idle", progress: null, error: null }),
    }));
  }, []);

  const clearSource = useCallback((sourceId: number) => {
    setStates((prev) => {
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });
  }, []);

  useEffect(() => {
    const currentIds = new Set(sourceIds);
    const connectedIds = new Set(Object.keys(connectionsRef.current).map(Number));

    // Close connections for sources no longer in the list
    for (const id of connectedIds) {
      if (!currentIds.has(id)) {
        connectionsRef.current[id]?.();
        delete connectionsRef.current[id];
      }
    }

    // Open connections for new sources
    for (const sourceId of sourceIds) {
      if (connectedIds.has(sourceId)) continue;

      function handleMessage(raw: string) {
        const msg: WsMessage = JSON.parse(raw);
        switch (msg.type) {
          case "status":
            updateSource(sourceId, (prev) => ({
              ...prev,
              status: msg.status ?? prev.status,
              error: msg.error ?? null,
            }));
            break;
          case "progress":
            if (msg.current !== undefined && msg.total !== undefined) {
              updateSource(sourceId, (prev) => ({
                ...prev,
                progress: { current: msg.current!, total: msg.total! },
              }));
            }
            break;
          case "stats":
            // Stats are not needed on Dashboard cards
            break;
        }
      }

      if (isWails) {
        const eventName = `sync:${sourceId}`;
        let cancelled = false;
        EventsOn(eventName, handleMessage);
        WatchSync(sourceId).then(() => {
          if (!cancelled) {
            updateSource(sourceId, (prev) => ({ ...prev }));
          }
        });
        connectionsRef.current[sourceId] = () => {
          cancelled = true;
          EventsOff(eventName);
          StopWatchSync(sourceId);
        };
      } else {
        const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/sync/${sourceId}`;
        const ws = new WebSocket(wsUrl);

        ws.onmessage = (event) => handleMessage(event.data);
        ws.onclose = () => {
          delete connectionsRef.current[sourceId];
        };

        connectionsRef.current[sourceId] = () => ws.close();
      }
    }

    // Cleanup on unmount
    return () => {
      for (const cleanup of Object.values(connectionsRef.current)) {
        cleanup();
      }
      connectionsRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceIds.join(",")]);

  return { states, clearSource };
}
