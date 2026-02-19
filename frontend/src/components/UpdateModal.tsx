import {
  Modal,
  Stack,
  Text,
  Group,
  Button,
  Progress,
  Alert,
  Badge,
  ScrollArea,
  Divider,
} from "@mantine/core";
import {
  IconDownload,
  IconAlertTriangle,
  IconCheck,
  IconRefresh,
} from "@tabler/icons-react";
import type { useUpdater } from "../hooks/useUpdater";

interface UpdateModalProps {
  opened: boolean;
  onClose: () => void;
  updater: ReturnType<typeof useUpdater>;
}

export function UpdateModal({ opened, onClose, updater }: UpdateModalProps) {
  const { currentVersion, updateInfo, progress, checking, check, install, isInstalling } = updater;

  const isDone = progress?.phase === "done";
  const isError = progress?.phase === "error";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Update Available"
      size="md"
      closeOnClickOutside={!isInstalling}
      closeOnEscape={!isInstalling}
    >
      <Stack gap="md">
        {updateInfo && (
          <Group gap="sm">
            <Text size="sm" c="dimmed">
              Current version:
            </Text>
            <Badge variant="outline" color="gray">
              {currentVersion}
            </Badge>
            <Text size="sm" c="dimmed">→</Text>
            <Badge variant="filled" color="blue">
              {updateInfo.version}
            </Badge>
          </Group>
        )}

        {updateInfo?.notes && (
          <>
            <Divider label="Release notes" labelPosition="left" />
            <ScrollArea h={120} offsetScrollbars>
              <Text size="xs" style={{ whiteSpace: "pre-wrap" }} c="dimmed">
                {updateInfo.notes}
              </Text>
            </ScrollArea>
          </>
        )}

        {progress && !isError && (
          <Stack gap="xs">
            <Progress
              value={progress.percent}
              animated={isInstalling}
              color={isDone ? "green" : "blue"}
              size="sm"
            />
            <Text size="xs" c="dimmed">
              {progress.message}
            </Text>
          </Stack>
        )}

        {isError && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Update failed">
            {progress?.message}
          </Alert>
        )}

        {isDone && (
          <Alert color="green" icon={<IconCheck size={16} />} title="Update complete">
            {progress?.message}
          </Alert>
        )}

        <Group justify="space-between">
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={check}
            loading={checking}
            disabled={isInstalling}
          >
            Re-check
          </Button>

          <Group gap="sm">
            <Button
              variant="default"
              onClick={onClose}
              disabled={isInstalling}
            >
              Close
            </Button>
            {!isDone && (
              <Button
                leftSection={<IconDownload size={16} />}
                onClick={install}
                loading={isInstalling}
                disabled={!updateInfo || isDone}
                color="blue"
              >
                {isInstalling ? "Installing…" : "Download & Install"}
              </Button>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
