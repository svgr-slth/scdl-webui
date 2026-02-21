import {
  Stack,
  Title,
  Text,
  Button,
  Group,
  ThemeIcon,
  Badge,
  Alert,
  CopyButton,
  TextInput,
} from "@mantine/core";
import {
  IconVinyl,
  IconSettings,
  IconInfoCircle,
  IconArrowRight,
  IconCopy,
  IconCheck,
  IconFolder,
} from "@tabler/icons-react";
import { useState } from "react";

const RB_STEPS = [
  { src: "/rekordbox-steps/step-1.png", caption: "File → Preferences" },
  { src: "/rekordbox-steps/step-2.png", caption: "Advanced → Database → rekordbox xml" },
  { src: "/rekordbox-steps/step-3.png", caption: "View → Layout → check rekordbox xml" },
];

function StepCarousel() {
  const [idx, setIdx] = useState(0);
  const slide = RB_STEPS[idx];
  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      <img
        src={slide.src}
        alt={slide.caption}
        style={{ width: "100%", borderRadius: 8, display: "block", border: "1px solid var(--mantine-color-dark-4)" }}
      />
      {/* Caption */}
      <div style={{
        position: "absolute", bottom: 32, left: 0, right: 0,
        textAlign: "center", padding: "4px 8px",
        background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 11,
      }}>
        {slide.caption}
      </div>
      {/* Prev */}
      {idx > 0 && (
        <button onClick={() => setIdx(idx - 1)} style={{
          position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)",
          background: "rgba(0,0,0,0.45)", border: "none", borderRadius: 4,
          color: "#fff", cursor: "pointer", padding: "4px 8px", fontSize: 16,
        }}>‹</button>
      )}
      {/* Next */}
      {idx < RB_STEPS.length - 1 && (
        <button onClick={() => setIdx(idx + 1)} style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          background: "rgba(0,0,0,0.45)", border: "none", borderRadius: 4,
          color: "#fff", cursor: "pointer", padding: "4px 8px", fontSize: 16,
        }}>›</button>
      )}
      {/* Dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
        {RB_STEPS.map((_, i) => (
          <div key={i} onClick={() => setIdx(i)} style={{
            width: i === idx ? 18 : 7, height: 7, borderRadius: 4,
            background: i === idx ? "var(--mantine-color-violet-5)" : "var(--mantine-color-dark-4)",
            cursor: "pointer", transition: "all 250ms ease",
          }} />
        ))}
      </div>
    </div>
  );
}
import { FolderPicker } from "../../FolderPicker";

interface Props {
  value: string;
  onChange: (v: string) => void;
  subStep: number;
  onSubStepChange: (s: number) => void;
}

export function RekordboxStep({ value, onChange, subStep, onSubStepChange }: Props) {
  return (
    <>
      {/* Sub-step mini progress */}
      <Group gap="xs" mb="lg" justify="center">
        {[0, 1].map((i) => (
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
      {subStep === 1 && <RekordboxTutorial value={value} onChange={onChange} />}
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

function RekordboxTutorial({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [pickerOpened, setPickerOpened] = useState(false);

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={3}>Configuring Rekordbox</Title>
        <Text size="sm" c="dimmed">
          Follow these steps inside Rekordbox to enable the XML import:
        </Text>
      </Stack>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "flex-start" }}>
        <StepCarousel />

        <Stack gap="xs">
          {[
            "Open Rekordbox and go to Preferences (⌘, / Ctrl+,)",
            "Navigate to Advanced → Database",
            'Under "rekordbox xml", paste the path shown below — this is where scdl-web will write its XML. If you already have a rekordbox XML file, click "Use custom" to point to it instead.',
            "Close and restart Rekordbox",
            'In Preferences → View → Layout, make sure "rekordbox xml" is checked',
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
              <Text size="sm" style={{ flex: 1 }}>{step}</Text>
            </Group>
          ))}
        </Stack>
      </div>

      <Alert icon={<IconInfoCircle size={16} />} color="violet" variant="light">
        <Stack gap="xs">
          <Group gap="xs" wrap="nowrap" align="flex-end">
            <TextInput
              flex={1}
              size="xs"
              readOnly
              value={value}
              placeholder="No path configured — click 'Use custom' to set one"
              styles={{ input: { fontFamily: "monospace", fontSize: 11 } }}
            />
            <CopyButton value={value} timeout={2000}>
              {({ copied, copy }) => (
                <Button
                  size="xs"
                  variant="light"
                  color={copied ? "teal" : "violet"}
                  leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  onClick={copy}
                  disabled={!value}
                  style={{ flexShrink: 0 }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
            </CopyButton>
            <Button
              size="xs"
              variant="light"
              color="violet"
              leftSection={<IconFolder size={14} />}
              onClick={() => setPickerOpened(true)}
              style={{ flexShrink: 0 }}
            >
              Use custom
            </Button>
          </Group>
        </Stack>
      </Alert>

      <FolderPicker
        opened={pickerOpened}
        onClose={() => setPickerOpened(false)}
        fileFilter="*.xml"
        onSelect={(selected) => {
          // If user clicked a file, use it directly; if they clicked "Use this folder", append filename
          if (selected.toLowerCase().endsWith(".xml")) {
            onChange(selected);
          } else {
            const sep = selected.includes("\\") ? "\\" : "/";
            onChange(selected.replace(/[\\/]$/, "") + sep + "rekordbox.xml");
          }
        }}
        initialPath={value ? value.replace(/[\\/][^\\/]*$/, "") || "/" : "/"}
      />
    </Stack>
  );
}
