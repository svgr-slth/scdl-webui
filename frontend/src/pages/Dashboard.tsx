import { Title, SimpleGrid, Button, Group, Alert } from "@mantine/core";
import { IconRefresh, IconAlertCircle } from "@tabler/icons-react";
import { useSources } from "../hooks/useSources";
import { syncApi } from "../api/sync";
import { SourceCard } from "../components/SourceCard";
import { useSyncWebSocket } from "../hooks/useSyncWebSocket";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";

export function Dashboard() {
  const { data: sources, isLoading, error } = useSources();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<number | null>(null);

  // Poll sync status to detect which source is currently syncing
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await syncApi.status();
        if (!cancelled) {
          setActiveSourceId(status.is_syncing ? status.active_source_id : null);
        }
      } catch {
        // ignore
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Connect WebSocket to the active source for real-time progress
  const { progress, status: wsStatus } = useSyncWebSocket(activeSourceId);

  // Refresh sources list when a sync finishes
  useEffect(() => {
    if (wsStatus === "completed" || wsStatus === "failed" || wsStatus === "cancelled") {
      qc.invalidateQueries({ queryKey: ["sources"] });
      setActiveSourceId(null);
    }
  }, [wsStatus, qc]);

  const handleSync = useCallback(async (sourceId: number) => {
    await syncApi.trigger(sourceId);
    setActiveSourceId(sourceId);
    qc.invalidateQueries({ queryKey: ["sources"] });
  }, [qc]);

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      await syncApi.triggerAll();
    } finally {
      setSyncing(false);
      qc.invalidateQueries({ queryKey: ["sources"] });
    }
  };

  if (isLoading) return <Title order={3}>Loading...</Title>;
  if (error) return <Alert color="red" icon={<IconAlertCircle />}>{String(error)}</Alert>;

  return (
    <>
      <Group justify="space-between" mb="lg">
        <Title order={2}>Dashboard</Title>
        <Button leftSection={<IconRefresh size={16} />} onClick={handleSyncAll} loading={syncing}>
          Sync All
        </Button>
      </Group>

      {sources && sources.length === 0 ? (
        <Alert>No sources configured. Go to Sources to add one.</Alert>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {sources?.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              onSync={handleSync}
              progress={s.id === activeSourceId ? progress : null}
              isSyncing={s.id === activeSourceId}
            />
          ))}
        </SimpleGrid>
      )}
    </>
  );
}
