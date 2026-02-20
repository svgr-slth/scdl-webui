import { useEffect, useRef, useState, useCallback } from "react";
import { BASE_URL } from "../api/client";

interface LogLine {
  line: string;
  ts: number;
}

interface MoveProgress {
  current: number;
  total: number;
}

export type MoveStatus = "idle" | "scanning" | "moving" | "rewriting" | "completed" | "failed";

interface MoveMessage {
  type: "log" | "status" | "progress";
  line?: string;
  status?: MoveStatus;
  error?: string;
  current?: number;
  total?: number;
}

export function useMoveWebSocket(active: boolean) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<MoveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<MoveProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const clear = useCallback(() => {
    setLogs([]);
    setStatus("idle");
    setError(null);
    setProgress(null);
  }, []);

  useEffect(() => {
    if (!active) {
      setConnected(false);
      return;
    }

    function handleMessage(msg: MoveMessage) {
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
      let isActive = true;
      let timeoutId: ReturnType<typeof setTimeout>;
      setConnected(true);

      const poll = async () => {
        if (!isActive) return;
        try {
          const res = await fetch(`${BASE_URL}/move-library/live?cursor=${cursor}`);
          if (!res.ok) throw new Error("poll failed");
          const data = await res.json();

          handleMessage({ type: "status", status: data.status as MoveStatus, error: data.error ?? undefined });
          for (const line of (data.logs as string[])) {
            handleMessage({ type: "log", line });
          }
          if (data.progress) {
            handleMessage({ type: "progress", current: data.progress.current, total: data.progress.total });
          }
          cursor = data.cursor;

          const isTerminal = ["completed", "failed"].includes(data.status);
          if (!isTerminal) {
            timeoutId = setTimeout(poll, data.status === "idle" ? 2000 : 300);
          }
        } catch {
          if (isActive) timeoutId = setTimeout(poll, 1000);
        }
      };

      poll();
      return () => {
        isActive = false;
        clearTimeout(timeoutId);
        setConnected(false);
      };
    }

    // Dev / browser mode: connect directly via WebSocket.
    const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/move-library`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      handleMessage(JSON.parse(event.data));
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
  }, [active]);

  return { logs, status, error, progress, clear, connected };
}
