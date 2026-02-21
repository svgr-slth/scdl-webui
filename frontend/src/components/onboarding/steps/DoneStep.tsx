import { Stack, Title, Text, ThemeIcon } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";

export function DoneStep() {
  return (
    <Stack align="center" gap="xl" py="xl">
      <ThemeIcon
        size={72}
        radius="xl"
        color="teal"
        variant="gradient"
        gradient={{ from: "teal", to: "green" }}
        style={{
          animation: "popIn 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both",
        }}
      >
        <IconCheck size={40} stroke={3} />
      </ThemeIcon>

      <Stack align="center" gap="xs">
        <Title order={2} ta="center">
          You're all set!
        </Title>
        <Text c="dimmed" ta="center" maw={380} size="sm">
          Your workspace is ready. Add your first source from the dashboard and hit Sync — scdl-web will take care of the rest.
        </Text>
      </Stack>

      <Text size="xs" c="dimmed" ta="center">
        You can revisit any of these settings at any time from the Settings page.
      </Text>

      <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.5); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </Stack>
  );
}
