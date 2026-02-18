import { Title, Button, Group, Stack, Card, Alert, Divider, Modal, Text, Progress } from "@mantine/core";
import { IconPlayerPlay, IconArrowLeft, IconRefresh, IconFolder } from "@tabler/icons-react";
import { useParams, useNavigate } from "react-router-dom";
import { useSource, useUpdateSource, useResetArchive, useOpenFolder } from "../hooks/useSources";
import { SourceForm } from "../components/SourceForm";
import { SyncLogViewer } from "../components/SyncLogViewer";
import { useSyncWebSocket } from "../hooks/useSyncWebSocket";
import { syncApi } from "../api/sync";
import { useState, useCallback, useEffect } from "react";
import type { SourceCreate } from "../types/source";
import { useQueryClient } from "@tanstack/react-query";

export function SourceDetail() {
  const { id } = useParams<{ id: string }>();
  const sourceId = Number(id);
  const navigate = useNavigate();
  const { data: source, isLoading } = useSource(sourceId);
  const updateSource = useUpdateSource();
  const resetArchive = useResetArchive();
  const openFolder = useOpenFolder();
  const qc = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [checkedInitial, setCheckedInitial] = useState(false);
  const [resetConfirmOpened, setResetConfirmOpened] = useState(false);

  // On mount, check if this source is already syncing
  useEffect(() => {
    syncApi.sourceStatus(sourceId).then((res) => {
      if (res.is_syncing) {
        setIsSyncing(true);
      }
      setCheckedInitial(true);
    }).catch(() => {
      setCheckedInitial(true);
    });
  }, [sourceId]);

  // Connect WebSocket when syncing
  const { logs, status, error, stats, progress, clear, connected } = useSyncWebSocket(isSyncing ? sourceId : null);

  // When WS is connected and we have a pending sync, trigger it
  useEffect(() => {
    if (connected && pendingSync) {
      setPendingSync(false);
      syncApi.trigger(sourceId);
    }
  }, [connected, pendingSync, sourceId]);

  // Refresh source data when sync ends
  useEffect(() => {
    if (status === "completed" || status === "failed" || status === "cancelled") {
      qc.invalidateQueries({ queryKey: ["sources"] });
    }
  }, [status, qc]);

  const handleSync = useCallback(() => {
    clear();
    setIsSyncing(true);
    setPendingSync(true);
  }, [clear]);

  const handleUpdate = async (data: SourceCreate) => {
    await updateSource.mutateAsync({ id: sourceId, data });
    qc.invalidateQueries({ queryKey: ["sources", sourceId] });
  };

  if (isLoading || !checkedInitial) return <Title order={3}>Loading...</Title>;
  if (!source) return <Alert color="red">Source not found</Alert>;

  const syncActive = status === "running" || pendingSync;

  return (
    <Stack gap="lg">
      <Group>
        <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate("/sources")}>
          Back
        </Button>
        <Title order={2}>{source.name}</Title>
        <Button
          variant="light"
          leftSection={<IconFolder size={16} />}
          onClick={() => openFolder.mutate(sourceId)}
        >
          Open Folder
        </Button>
      </Group>

      <Card withBorder p="lg">
        <Title order={4} mb="md">Settings</Title>
        <SourceForm
          initial={source}
          onSubmit={handleUpdate}
          loading={updateSource.isPending}
          submitLabel="Update"
        />
      </Card>

      <Divider />

      <Card withBorder p="lg">
        <Group justify="space-between" mb="md">
          <Title order={4}>Sync</Title>
          <Group gap="xs">
            <Button
              variant="light"
              color="orange"
              leftSection={<IconRefresh size={16} />}
              onClick={() => setResetConfirmOpened(true)}
              disabled={syncActive}
            >
              Reset Archive
            </Button>
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={handleSync}
              loading={syncActive}
            >
              Sync Now
            </Button>
          </Group>
        </Group>
        {isSyncing && (
          <>
            {progress && progress.total > 0 && (
              <Stack gap={4} mb="sm">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Track {progress.current} / {progress.total}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {Math.round((progress.current / progress.total) * 100)}%
                  </Text>
                </Group>
                <Progress
                  value={(progress.current / progress.total) * 100}
                  size="lg"
                  radius="md"
                  animated={syncActive}
                />
              </Stack>
            )}
            <SyncLogViewer logs={logs} />
            {stats && (
              <Alert color="green" mt="sm">
                Done: {stats.added} added, {stats.removed} removed, {stats.skipped} skipped
              </Alert>
            )}
            {status === "failed" && (
              <Alert color="red" mt="sm">
                Sync failed{error ? `: ${error}` : ""}
              </Alert>
            )}
          </>
        )}
      </Card>

      <Modal
        opened={resetConfirmOpened}
        onClose={() => setResetConfirmOpened(false)}
        title="Reset Archive"
        size="sm"
      >
        <Stack gap="md">
          <Text>
            This will wipe the download archive for <strong>{source.name}</strong>.
            The next sync will re-download all tracks. Existing files will not be deleted.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setResetConfirmOpened(false)}>
              Cancel
            </Button>
            <Button
              color="orange"
              loading={resetArchive.isPending}
              onClick={async () => {
                await resetArchive.mutateAsync(sourceId);
                setResetConfirmOpened(false);
              }}
            >
              Reset
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
