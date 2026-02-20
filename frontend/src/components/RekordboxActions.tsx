import { ActionIcon, Alert, Button, Menu, Tooltip, Stack } from "@mantine/core";
import { IconVinyl, IconPlaylist } from "@tabler/icons-react";
import { useExportToCollection, useExportAsPlaylist, useRekordboxStatus } from "../hooks/useRekordbox";
import { useState, useEffect } from "react";
import type { RekordboxExportResult } from "../api/rekordbox";

interface Props {
  sourceId: number;
  variant: "menu" | "buttons";
  disabled?: boolean;
}

export function RekordboxActions({ sourceId, variant, disabled }: Props) {
  const { data: status } = useRekordboxStatus();
  const exportCollection = useExportToCollection();
  const exportPlaylist = useExportAsPlaylist();
  const [result, setResult] = useState<RekordboxExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss feedback after 5 seconds
  useEffect(() => {
    if (!result && !error) return;
    const timer = setTimeout(() => {
      setResult(null);
      setError(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [result, error]);

  // Rekordbox is not available on Linux
  if (status?.platform === "linux") return null;

  const handleCollection = () => {
    setResult(null);
    setError(null);
    exportCollection.mutate(sourceId, {
      onSuccess: (data) => setResult(data),
      onError: (err) => setError(err.message),
    });
  };

  const handlePlaylist = () => {
    setResult(null);
    setError(null);
    exportPlaylist.mutate(sourceId, {
      onSuccess: (data) => setResult(data),
      onError: (err) => setError(err.message),
    });
  };

  const isLoading = exportCollection.isPending || exportPlaylist.isPending;

  const feedback = (result || error) && (
    <Alert
      color={error ? "red" : "green"}
      withCloseButton
      onClose={() => { setResult(null); setError(null); }}
    >
      {error
        ? error
        : result?.playlist_name
          ? `${result.tracks_added} tracks added, ${result.tracks_skipped} skipped. Playlist "${result.playlist_name}" (${result.playlist_tracks} tracks)`
          : `${result!.tracks_added} tracks added, ${result!.tracks_skipped} skipped`}
    </Alert>
  );

  if (variant === "menu") {
    return (
      <Stack gap={4}>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Tooltip label="Rekordbox">
              <ActionIcon variant="subtle" loading={isLoading} disabled={disabled}>
                <IconVinyl size={16} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconVinyl size={14} />}
              onClick={handleCollection}
            >
              Add to Collection
            </Menu.Item>
            <Menu.Item
              leftSection={<IconPlaylist size={14} />}
              onClick={handlePlaylist}
            >
              Add as Playlist
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        {feedback}
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Button.Group>
        <Button
          variant="light"
          leftSection={<IconVinyl size={16} />}
          onClick={handleCollection}
          loading={exportCollection.isPending}
          disabled={disabled || exportPlaylist.isPending}
        >
          Add to Rekordbox
        </Button>
        <Button
          variant="light"
          leftSection={<IconPlaylist size={16} />}
          onClick={handlePlaylist}
          loading={exportPlaylist.isPending}
          disabled={disabled || exportCollection.isPending}
        >
          Add as Playlist
        </Button>
      </Button.Group>
      {feedback}
    </Stack>
  );
}
