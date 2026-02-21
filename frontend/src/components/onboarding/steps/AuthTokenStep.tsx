import { Stack, Title, Text, PasswordInput, ThemeIcon, Alert, Group } from "@mantine/core";
import { IconKey, IconInfoCircle } from "@tabler/icons-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function AuthTokenStep({ value, onChange }: Props) {
  return (
    <Stack gap="lg">
      <Group gap="md" align="flex-start">
        <ThemeIcon size={44} radius="md" variant="light" color="orange">
          <IconKey size={24} />
        </ThemeIcon>
        <Stack gap={4} flex={1}>
          <Title order={3}>
            SoundCloud auth token{" "}
            <Text span size="sm" c="dimmed" fw={400}>
              (optional)
            </Text>
          </Title>
          <Text size="sm" c="dimmed">
            Public tracks and playlists work without a token. You'll need one for:
          </Text>
        </Stack>
      </Group>

      <Stack gap="xs" pl="xs">
        {[
          "Your private tracks and reposts",
          "Playlists with more than 500 tracks",
          "Tracks that require a logged-in account",
        ].map((item) => (
          <Text key={item} size="sm" c="dimmed">
            · {item}
          </Text>
        ))}
      </Stack>

      <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
        <Text size="xs">
          Find your token in your browser's DevTools under Application → Cookies →
          soundcloud.com, or via the Network tab (look for the{" "}
          <Text span ff="monospace" size="xs">
            Authorization: OAuth …
          </Text>{" "}
          header on any SoundCloud request).
        </Text>
      </Alert>

      <PasswordInput
        label="Auth token"
        placeholder="2-a1b2c3d4e5f6..."
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        description="Stored locally, never shared."
      />
    </Stack>
  );
}
