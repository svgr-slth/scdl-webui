import {
  Stack,
  Title,
  Text,
  TextInput,
  Button,
  Group,
  ThemeIcon,
  Paper,
  Badge,
  Alert,
} from "@mantine/core";
import {
  IconVinyl,
  IconFolder,
  IconSettings,
  IconInfoCircle,
  IconArrowRight,
} from "@tabler/icons-react";
import { useState } from "react";
import { FolderPicker } from "../../FolderPicker";

interface Props {
  value: string;
  onChange: (v: string) => void;
  detectedPath: string | null;
  subStep: number;
  onSubStepChange: (s: number) => void;
}

export function RekordboxStep({ value, onChange, detectedPath, subStep, onSubStepChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      {/* Sub-step mini progress */}
      <Group gap="xs" mb="lg" justify="center">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background:
                i <= subStep
                  ? "var(--mantine-color-violet-5)"
                  : "var(--mantine-color-dark-4)",
              transition: "background 300ms ease",
            }}
          />
        ))}
      </Group>

      {subStep === 0 && <RekordboxIntro onNext={() => onSubStepChange(1)} />}
      {subStep === 1 && <RekordboxTutorial onNext={() => onSubStepChange(2)} />}
      {subStep === 2 && (
        <RekordboxPath
          value={value}
          onChange={onChange}
          detectedPath={detectedPath}
          onPickerOpen={() => setPickerOpen(true)}
        />
      )}

      <FolderPicker
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={onChange}
        initialPath={value || undefined}
      />
    </>
  );
}

function RekordboxIntro({ onNext }: { onNext: () => void }) {
  return (
    <Stack gap="lg">
      <Group gap="md" align="flex-start">
        <ThemeIcon size={44} radius="md" variant="light" color="violet">
          <IconVinyl size={24} />
        </ThemeIcon>
        <Stack gap={4} flex={1}>
          <Group gap="xs">
            <Title order={3}>Rekordbox integration</Title>
            <Badge variant="light" color="violet" size="sm">
              Optional
            </Badge>
          </Group>
          <Text size="sm" c="dimmed">
            Connect scdl-web to your DJ software so your downloaded tracks appear as a ready-to-play playlist.
          </Text>
        </Stack>
      </Group>

      <Stack gap="md">
        <Text size="sm" fw={500}>How it works:</Text>
        {[
          {
            icon: <IconVinyl size={16} />,
            title: "The problem",
            desc: "Rekordbox doesn't sync from folders automatically — you have to import tracks manually.",
          },
          {
            icon: <IconArrowRight size={16} />,
            title: "The solution",
            desc: 'scdl-web exports an XML file that Rekordbox treats as an external "library". Your sources appear as playlists, ready to load.',
          },
          {
            icon: <IconSettings size={16} />,
            title: "One-time setup",
            desc: "You point Rekordbox at the XML file once. After that, every time you export from scdl-web, the playlist updates automatically.",
          },
        ].map(({ icon, title, desc }) => (
          <Group key={title} gap="sm" align="flex-start">
            <ThemeIcon size={28} radius="sm" variant="light" color="violet" mt={2}>
              {icon}
            </ThemeIcon>
            <Stack gap={2} flex={1}>
              <Text size="sm" fw={500}>{title}</Text>
              <Text size="sm" c="dimmed">{desc}</Text>
            </Stack>
          </Group>
        ))}
      </Stack>

      <Button variant="light" color="violet" rightSection={<IconArrowRight size={16} />} onClick={onNext}>
        Show me how to set it up
      </Button>
    </Stack>
  );
}

function RekordboxTutorial({ onNext }: { onNext: () => void }) {
  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={3}>Configuring Rekordbox</Title>
        <Text size="sm" c="dimmed">
          Follow these steps inside Rekordbox to enable the XML import:
        </Text>
      </Stack>

      {/* GIF placeholder */}
      <Paper
        withBorder
        radius="md"
        style={{
          aspectRatio: "16/9",
          background: "var(--mantine-color-dark-6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px dashed var(--mantine-color-dark-4)",
        }}
      >
        <Stack align="center" gap="xs">
          <IconVinyl size={32} color="var(--mantine-color-dark-3)" />
          <Text size="xs" c="dimmed">Tutorial GIF — coming soon</Text>
        </Stack>
      </Paper>

      <Stack gap="xs">
        {[
          "Open Rekordbox and go to Preferences (⌘, / Ctrl+,)",
          'Navigate to Advanced → Database',
          'Under "rekordbox xml", set the path to the XML file scdl-web will create',
          "Click OK and restart Rekordbox",
          'The "rekordbox xml" section will now appear in the left sidebar',
        ].map((step, i) => (
          <Group key={i} gap="sm" align="flex-start">
            <Text
              size="xs"
              fw={700}
              c="violet"
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "1px solid var(--mantine-color-violet-5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              {i + 1}
            </Text>
            <Text size="sm">{step}</Text>
          </Group>
        ))}
      </Stack>

      <Button variant="light" color="violet" rightSection={<IconArrowRight size={16} />} onClick={onNext}>
        Set the XML path
      </Button>
    </Stack>
  );
}

function RekordboxPath({
  value,
  onChange,
  detectedPath,
  onPickerOpen,
}: {
  value: string;
  onChange: (v: string) => void;
  detectedPath: string | null;
  onPickerOpen: () => void;
}) {
  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={3}>XML file path</Title>
        <Text size="sm" c="dimmed">
          This is where scdl-web will write the Rekordbox XML file. Point Rekordbox at this same path.
        </Text>
      </Stack>

      {detectedPath && !value && (
        <Alert icon={<IconInfoCircle size={16} />} color="violet" variant="light">
          <Stack gap="xs">
            <Text size="sm">We detected an existing Rekordbox XML at:</Text>
            <Text size="xs" ff="monospace" c="violet.3">
              {detectedPath}
            </Text>
            <Button
              size="xs"
              variant="light"
              color="violet"
              onClick={() => onChange(detectedPath)}
            >
              Use this path
            </Button>
          </Stack>
        </Alert>
      )}

      <Group gap="xs" align="flex-end">
        <TextInput
          flex={1}
          label="XML path"
          placeholder="C:\Users\...\rekordbox.xml"
          value={value}
          onChange={(e) => onChange(e.currentTarget.value)}
          description="Leave empty to use the default location inside the app data folder"
        />
        <Button variant="light" leftSection={<IconFolder size={16} />} onClick={onPickerOpen}>
          Browse
        </Button>
      </Group>
    </Stack>
  );
}
