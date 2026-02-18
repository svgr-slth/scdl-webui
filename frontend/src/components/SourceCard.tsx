import { Card, Text, Badge, Group, Button, ActionIcon, Stack, Progress, Tooltip } from "@mantine/core";
import { IconPlayerPlay, IconFolder } from "@tabler/icons-react";
import type { Source } from "../types/source";
import { useNavigate } from "react-router-dom";
import { useOpenFolder } from "../hooks/useSources";

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
};

interface Props {
  source: Source;
  onSync: (id: number) => void;
  progress?: { current: number; total: number } | null;
  isSyncing?: boolean;
}

export function SourceCard({ source, onSync, progress, isSyncing }: Props) {
  const navigate = useNavigate();
  const openFolder = useOpenFolder();
  const hasProgress = progress && progress.total > 0;
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

        {isSyncing && (
          <Stack gap={4}>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                {hasProgress ? `${progress.current} / ${progress.total} tracks` : "Syncing..."}
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
              striped={!hasProgress}
            />
          </Stack>
        )}

        <Group justify="space-between" mt="xs">
          <Group gap="xs">
            {isSyncing ? (
              <Badge size="xs" color="blue">running</Badge>
            ) : source.last_sync_status ? (
              <Badge size="xs" color={statusColors[source.last_sync_status] || "gray"}>
                {source.last_sync_status}
              </Badge>
            ) : null}
            {!isSyncing && source.last_sync_at && (
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
            <Button size="xs" variant="light" onClick={() => navigate(`/sources/${source.id}`)}>
              Details
            </Button>
            <Button
              size="xs"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={() => onSync(source.id)}
              loading={isSyncing}
            >
              Sync
            </Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}
