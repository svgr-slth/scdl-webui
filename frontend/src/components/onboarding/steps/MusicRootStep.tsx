import { Stack, Title, Text, TextInput, Button, Group, ThemeIcon, Paper } from "@mantine/core";
import { IconFolder, IconFolderOpen } from "@tabler/icons-react";
import { useState } from "react";
import { FolderPicker } from "../../FolderPicker";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function MusicRootStep({ value, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <Stack gap="lg">
        <Group gap="md" align="flex-start">
          <ThemeIcon size={44} radius="md" variant="light" color="blue">
            <IconFolderOpen size={24} />
          </ThemeIcon>
          <Stack gap={4} flex={1}>
            <Title order={3}>Music folder</Title>
            <Text size="sm" c="dimmed">
              This is the root directory where all your sources will be downloaded. Each source
              gets its own subfolder inside it — keep it on a drive with plenty of space.
            </Text>
          </Stack>
        </Group>

        <Paper withBorder p="md" radius="md" bg="dark.7">
          <Text size="xs" c="dimmed" mb="xs" tt="uppercase" fw={600} style={{ letterSpacing: "0.05em" }}>
            Example structure
          </Text>
          <Text size="xs" ff="monospace" c="blue.3">
            {value || "/home/user/Music"}/
            <br />
            {"  "}├── my-favourite-artist/
            <br />
            {"  "}│{"   "}├── track-01.mp3
            <br />
            {"  "}│{"   "}└── track-02.mp3
            <br />
            {"  "}└── another-source/
          </Text>
        </Paper>

        <Group gap="xs" align="flex-end">
          <TextInput
            flex={1}
            label="Music root path"
            placeholder="/home/user/Music"
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
          />
          <Button
            variant="light"
            leftSection={<IconFolder size={16} />}
            onClick={() => setPickerOpen(true)}
          >
            Browse
          </Button>
        </Group>
      </Stack>

      <FolderPicker
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onChange}
        initialPath={value || undefined}
      />
    </>
  );
}
