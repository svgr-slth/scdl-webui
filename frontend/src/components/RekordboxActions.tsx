import { Alert, Button, Stack, Text } from "@mantine/core";
import { IconVinyl } from "@tabler/icons-react";
import { useExportToRekordbox, useRekordboxStatus } from "../hooks/useRekordbox";
import { useState, useEffect } from "react";
import type { RekordboxExportResult } from "../api/rekordbox";

interface Props {
  sourceId: number;
  disabled?: boolean;
}

export function RekordboxActions({ sourceId, disabled }: Props) {
  const { data: status } = useRekordboxStatus();
  const exportMutation = useExportToRekordbox();
  const [result, setResult] = useState<RekordboxExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-dismiss feedback after 6 seconds
  useEffect(() => {
    if (!result && !error) return;
    const timer = setTimeout(() => {
      setResult(null);
      setError(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [result, error]);

  // Rekordbox is not available on Linux
  if (status?.platform === "linux") return null;

  const handleExport = () => {
    setResult(null);
    setError(null);
    exportMutation.mutate(sourceId, {
      onSuccess: (data) => setResult(data),
      onError: (err) => setError(err.message),
    });
  };

  return (
    <Stack gap={4}>
      <Button
        variant="light"
        leftSection={<IconVinyl size={16} />}
        onClick={handleExport}
        loading={exportMutation.isPending}
        disabled={disabled}
      >
        Export to Rekordbox
      </Button>

      {error && (
        <Alert color="red" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {result && (
        <Alert
          color="green"
          withCloseButton
          onClose={() => setResult(null)}
        >
          <Text size="sm">
            {result.tracks_added > 0
              ? `${result.tracks_added} new track${result.tracks_added !== 1 ? "s" : ""} added to "${result.playlist_name}".`
              : `"${result.playlist_name}" is up to date.`}
            {result.playlist_updated > result.tracks_added
              ? ` ${result.playlist_updated - result.tracks_added} existing track${result.playlist_updated - result.tracks_added !== 1 ? "s" : ""} added to the playlist.`
              : ""}
          </Text>
          {result.is_rekordbox_running ? (
            <Text size="xs" c="orange" mt={4}>
              Rekordbox is open — close and reopen to see the playlist.
            </Text>
          ) : (
            <Text size="xs" c="dimmed" mt={4}>
              Open Rekordbox to find your playlist.
            </Text>
          )}
        </Alert>
      )}
    </Stack>
  );
}
