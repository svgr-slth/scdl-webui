import { Card, Text, Badge, Group, Button, ActionIcon, Stack, Progress, Tooltip } from "@mantine/core";
import { IconPlayerPlay, IconFolder, IconTrash } from "@tabler/icons-react";
import type { Source } from "../types/source";
import { useNavigate } from "react-router-dom";
import { useOpenFolder } from "../hooks/useSources";
import { RekordboxActions } from "./RekordboxActions";

const typeLabels: Record<string, string> = {
  playlist: "Playlist",
  artist_tracks: "Artist Tracks",
  artist_all: "Artist All",
  likes: "Likes",
  user_reposts: "Reposts",
};

const statusColors: Record<string, string> = {
  completed: "green",
  running: "blue",
  failed: "red",
  cancelled: "yellow",
  queued: "grape",
};

interface Props {
  source: Source;
  onSync: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  progress?: { current: number; total: number } | null;
  syncStatus?: "running" | "queued" | null;
}

export function SourceCard({ source, onSync, onDelete, progress, syncStatus }: Props) {
  const navigate = useNavigate();
  const openFolder = useOpenFolder();
  const isActive = syncStatus === "running" || syncStatus === "queued";
  const isRunning = syncStatus === "running";
  const isQueued = syncStatus === "queued";
  const hasProgress = isRunning && progress && progress.total > 0;
  const pct = hasProgress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <Card shadow="sm" padding="md" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600} truncate>{source.name}</Text>
          <Badge size="sm" variant="light">
            {typeLabels[source.source_type] || source.source_type}
          </Badge>
        </Group>

        <Text size="xs" c="dimmed" truncate>{source.url}</Text>
        <Text size="xs" c="dimmed">Folder: {source.local_folder}</Text>
        <Text size="xs" c="dimmed">Format: {source.audio_format.toUpperCase()}</Text>

        {isActive && (
          <Stack gap={4}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {isQueued
                  ? "Waiting in queue..."
                  : hasProgress
                    ? `${progress.current} / ${progress.total} tracks`
                    : "Syncing..."}
              </Text>
              {hasProgress && (
                <Text size="xs" c="dimmed">{pct}%</Text>
              )}
            </Group>
            <Progress
              value={hasProgress ? pct : 100}
              size="sm"
              radius="md"
              animated
              striped={isQueued || !hasProgress}
              color={isQueued ? "grape" : undefined}
            />
          </Stack>
        )}

        <Group justify="space-between" mt="xs">
          <Group gap="xs">
            {isActive ? (
              <Badge size="xs" color={statusColors[syncStatus!]}>
                {syncStatus}
              </Badge>
            ) : source.last_sync_status ? (
              <Badge size="xs" color={statusColors[source.last_sync_status] || "gray"}>
                {source.last_sync_status}
              </Badge>
            ) : null}
            {!isActive && source.last_sync_at && (
              <Text size="xs" c="dimmed">
                {new Date(source.last_sync_at).toLocaleDateString()}
              </Text>
            )}
          </Group>
          <Group gap="xs">
            <Tooltip label="Open folder">
              <ActionIcon variant="subtle" onClick={() => openFolder.mutate(source.id)}>
                <IconFolder size={16} />
              </ActionIcon>
            </Tooltip>
            <RekordboxActions sourceId={source.id} disabled={isActive} />
            <Tooltip label="Delete">
              <ActionIcon variant="subtle" color="red" onClick={() => onDelete(source.id, source.name)}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
            <Button size="xs" variant="light" onClick={() => navigate(`/sources/${source.id}`)}>
              Details
            </Button>
            <Button
              size="xs"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={() => onSync(source.id)}
              loading={isActive}
            >
              Sync
            </Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}
