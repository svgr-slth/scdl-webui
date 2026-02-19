import { Title, SimpleGrid, Button, Group, Alert, Modal, Stack, Text, Checkbox, Badge } from "@mantine/core";
import { IconRefresh, IconAlertCircle, IconPlus } from "@tabler/icons-react";
import { useSources, useCreateSource, useDeleteSource } from "../hooks/useSources";
import { useSettings } from "../hooks/useSettings";
import { syncApi } from "../api/sync";
import { SourceCard } from "../components/SourceCard";
import { SourceForm } from "../components/SourceForm";
import { useSyncWebSocket } from "../hooks/useSyncWebSocket";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import type { SourceCreate } from "../types/source";

export function Dashboard() {
  const { data: sources, isLoading, error } = useSources();
  const { data: appSettings } = useSettings();
  const createSource = useCreateSource();
  const deleteSource = useDeleteSource();
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState<number | null>(null);
  const [addOpened, setAddOpened] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);

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

  const handleCreate = async (data: SourceCreate) => {
    await createSource.mutateAsync(data);
    setAddOpened(false);
  };

  const handleDelete = useCallback((id: number, name: string) => {
    setDeleteTarget({ id, name });
    setDeleteFiles(false);
  }, []);

  if (isLoading) return <Title order={3}>Loading...</Title>;
  if (error) return <Alert color="red" icon={<IconAlertCircle />}>{String(error)}</Alert>;

  return (
    <>
      <Group justify="space-between" mb="lg">
        <Title order={2}>Dashboard</Title>
        <Group gap="xs">
          {appSettings?.auto_sync_enabled && (
            <Badge variant="light" color="teal" size="lg">
              Auto-sync: every {appSettings.auto_sync_interval_minutes} min
            </Badge>
          )}
          <Button leftSection={<IconPlus size={16} />} variant="light" onClick={() => setAddOpened(true)}>
            Add Source
          </Button>
          <Button leftSection={<IconRefresh size={16} />} onClick={handleSyncAll} loading={syncing}>
            Sync All
          </Button>
        </Group>
      </Group>

      {sources && sources.length === 0 ? (
        <Alert>No sources configured. Click "Add Source" to get started.</Alert>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {sources?.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              onSync={handleSync}
              onDelete={handleDelete}
              progress={s.id === activeSourceId ? progress : null}
              isSyncing={s.id === activeSourceId}
            />
          ))}
        </SimpleGrid>
      )}

      <Modal opened={addOpened} onClose={() => setAddOpened(false)} title="Add Source" size="lg">
        <SourceForm onSubmit={handleCreate} loading={createSource.isPending} />
      </Modal>

      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Source"
        size="sm"
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          </Text>
          <Text size="sm" c="dimmed">
            Archive and sync files will be deleted automatically.
          </Text>
          <Checkbox
            label="Also delete downloaded music files"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteSource.isPending}
              onClick={async () => {
                if (deleteTarget) {
                  await deleteSource.mutateAsync({
                    id: deleteTarget.id,
                    deleteFiles,
                  });
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
