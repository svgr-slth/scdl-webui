import { Stack, Title, Text, ThemeIcon } from "@mantine/core";
import { IconMusic } from "@tabler/icons-react";

export function WelcomeStep() {
  return (
    <Stack align="center" gap="lg" py="xl">
      <ThemeIcon size={72} radius="xl" variant="gradient" gradient={{ from: "blue", to: "violet" }}>
        <IconMusic size={40} />
      </ThemeIcon>
      <Stack align="center" gap="xs">
        <Title order={2} ta="center">
          Welcome to scdl-web
        </Title>
        <Text c="dimmed" ta="center" maw={380} size="sm">
          Your personal SoundCloud sync manager. Let's take two minutes to get
          everything set up so you can start downloading music right away.
        </Text>
      </Stack>
      <Text size="xs" c="dimmed" ta="center">
        We'll walk you through the essentials — you can always adjust these in Settings later.
      </Text>
    </Stack>
  );
}
