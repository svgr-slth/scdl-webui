import { Stack, Title, Text, Switch, NumberInput, ThemeIcon, Group, Paper } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";

interface Props {
  enabled: boolean;
  interval: number;
  onEnabledChange: (v: boolean) => void;
  onIntervalChange: (v: number) => void;
}

export function AutoSyncStep({ enabled, interval, onEnabledChange, onIntervalChange }: Props) {
  return (
    <Stack gap="lg">
      <Group gap="md" align="flex-start">
        <ThemeIcon size={44} radius="md" variant="light" color="teal">
          <IconClock size={24} />
        </ThemeIcon>
        <Stack gap={4} flex={1}>
          <Title order={3}>Automatic sync</Title>
          <Text size="sm" c="dimmed">
            scdl-web can periodically check your sources for new tracks and download them
            automatically — no manual action needed.
          </Text>
        </Stack>
      </Group>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="center">
          <Stack gap={2}>
            <Text size="sm" fw={500}>
              Enable auto-sync
            </Text>
            <Text size="xs" c="dimmed">
              Runs in the background while the app is open
            </Text>
          </Stack>
          <Switch
            checked={enabled}
            onChange={(e) => onEnabledChange(e.currentTarget.checked)}
            size="md"
          />
        </Group>
      </Paper>

      {enabled && (
        <NumberInput
          label="Sync interval"
          description="How often to check for new tracks (in minutes)"
          value={interval}
          onChange={(v) => onIntervalChange(typeof v === "number" ? v : 60)}
          min={5}
          max={1440}
          suffix=" min"
        />
      )}

      {!enabled && (
        <Text size="sm" c="dimmed" ta="center" py="xs">
          You can always trigger a sync manually from the dashboard.
        </Text>
      )}
    </Stack>
  );
}
