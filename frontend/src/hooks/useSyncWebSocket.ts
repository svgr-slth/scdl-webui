import { useEffect, useRef, useState, useCallback } from "react";
import type { WsMessage } from "../types/sync";
import { EventsOn, EventsOff } from "../wailsjs/runtime/runtime";
import { WatchSync, StopWatchSync } from "../wailsjs/go/main/App";

interface LogLine {
  line: string;
  ts: number;
}

export function useSyncWebSocket(sourceId: number | null) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ added: number; removed: number; skipped: number } | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const clear = useCallback(() => {
    setLogs([]);
    setStatus("idle");
    setError(null);
    setStats(null);
    setProgress(null);
  }, []);

  useEffect(() => {
    if (!sourceId) {
      setConnected(false);
      return;
    }

    function handleMessage(raw: string) {
      const msg: WsMessage = JSON.parse(raw);
      switch (msg.type) {
        case "log":
          if (msg.line !== undefined) {
            setLogs((prev) => [...prev, { line: msg.line!, ts: Date.now() }]);
          }
          break;
        case "status":
          if (msg.status) setStatus(msg.status);
          setError(msg.error ?? null);
          break;
        case "stats":
          setStats({
            added: msg.added ?? 0,
            removed: msg.removed ?? 0,
            skipped: msg.skipped ?? 0,
          });
          break;
        case "progress":
          if (msg.current !== undefined && msg.total !== undefined) {
            setProgress({ current: msg.current, total: msg.total });
          }
          break;
      }
    }

    // In Wails builds (all platforms), direct WebSocket connections from the
    // WebView don't reach the Python backend. Use the Go-side bridge instead:
    // WatchSync opens a WS connection server-side and relays via EventsEmit.
    // Note: window.runtime is injected by Wails on all platforms; the old
    // "wails:" protocol check only worked on Linux (Windows uses http://).
    const isWails = typeof (window as any).runtime !== "undefined";
    if (isWails) {
      const eventName = `sync:${sourceId}`;
      let cancelled = false;
      // Register listener BEFORE the connection is ready so no messages are lost.
      EventsOn(eventName, handleMessage);
      // WatchSync blocks until Go's WS to the backend is established, then resolves.
      WatchSync(sourceId).then(() => {
        if (!cancelled) setConnected(true);
      });
      return () => {
        cancelled = true;
        EventsOff(eventName);
        StopWatchSync(sourceId);
        setConnected(false);
      };
    }

    // Dev / browser mode: connect directly via WebSocket.
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/sync/${sourceId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      handleMessage(event.data);
    };

    ws.onclose = () => {
      wsRef.current = null;
      setConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [sourceId]);

  return { logs, status, error, stats, progress, clear, connected };
}
