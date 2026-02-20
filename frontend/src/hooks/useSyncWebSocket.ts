import { useEffect, useRef, useState, useCallback } from "react";
import type { WsMessage } from "../types/sync";
import { BASE_URL } from "../api/client";

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

    // Under Wails (wails:// protocol), WebView2 blocks direct WebSocket
    // connections and EventsEmit from goroutines is unreliable.
    // Use HTTP polling instead — the only channel that reliably works on Windows.
    if (window.location.protocol === "wails:") {
      let cursor = 0;
      let active = true;
      let timeoutId: ReturnType<typeof setTimeout>;
      setConnected(true);

      const poll = async () => {
        if (!active) return;
        try {
          const res = await fetch(`${BASE_URL}/sync/${sourceId}/live?cursor=${cursor}`);
          if (!res.ok) throw new Error("poll failed");
          const data = await res.json();

          // Only emit status when non-idle (avoid overwriting local state before sync starts)
          if (data.status && data.status !== "idle") {
            handleMessage(JSON.stringify({ type: "status", status: data.status, error: data.error ?? null }));
          }
          for (const line of (data.logs as string[])) {
            handleMessage(JSON.stringify({ type: "log", line }));
          }
          if (data.progress) {
            handleMessage(JSON.stringify({ type: "progress", ...data.progress }));
          }
          if (data.stats) {
            handleMessage(JSON.stringify({ type: "stats", ...data.stats }));
          }
          cursor = data.cursor;

          // Slow poll when idle/terminal so we can detect a new sync starting
          const isTerminal = ["completed", "failed", "cancelled"].includes(data.status);
          timeoutId = setTimeout(poll, isTerminal || data.status === "idle" ? 2000 : 300);
        } catch {
          if (active) timeoutId = setTimeout(poll, 1000);
        }
      };

      poll();
      return () => {
        active = false;
        clearTimeout(timeoutId);
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
