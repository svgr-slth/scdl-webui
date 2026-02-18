import { useEffect, useRef, useState, useCallback } from "react";
import type { WsMessage } from "../types/sync";

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

    // Under Wails (wails:// protocol), connect directly to the Python backend
    const wsUrl = window.location.protocol === "wails:"
      ? `ws://127.0.0.1:8000/ws/sync/${sourceId}`
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/sync/${sourceId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);
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
