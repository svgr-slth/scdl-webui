import { Box, Code, ScrollArea, Text } from "@mantine/core";
import { useEffect, useRef } from "react";

interface LogLine {
  line: string;
  ts: number;
}

interface Props {
  logs: LogLine[];
  height?: number;
}

export function SyncLogViewer({ logs, height = 400 }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) {
    return (
      <Box p="md" style={{ border: "1px solid var(--mantine-color-dark-4)", borderRadius: 8 }}>
        <Text c="dimmed" ta="center">Waiting for sync output...</Text>
      </Box>
    );
  }

  return (
    <ScrollArea h={height} viewportRef={viewportRef} style={{ border: "1px solid var(--mantine-color-dark-4)", borderRadius: 8 }}>
      <Code block p="sm" style={{ background: "transparent", fontSize: 12 }}>
        {logs.map((log, i) => (
          <div key={i}>{log.line}</div>
        ))}
      </Code>
    </ScrollArea>
  );
}
