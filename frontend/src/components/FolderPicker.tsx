import { Modal, Stack, Group, Button, TextInput, Text, ScrollArea, UnstyledButton, Loader } from "@mantine/core";
import { IconFolder, IconArrowUp, IconCheck } from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";
import { filesystemApi, type BrowseResult } from "../api/filesystem";

interface Props {
  opened: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
}

export function FolderPicker({ opened, onClose, onSelect, initialPath }: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath || "/");
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState("");

  const browse = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await filesystemApi.browse(path);
      setData(result);
      setCurrentPath(result.current);
      setManualPath(result.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to browse");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (opened) {
      browse(initialPath || "/");
    }
  }, [opened, initialPath, browse]);

  const handleManualGo = () => {
    if (manualPath.trim()) {
      browse(manualPath.trim());
    }
  };

  const handleSelect = () => {
    onSelect(currentPath);
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Select Folder" size="lg">
      <Stack gap="sm">
        <Group gap="xs">
          <TextInput
            flex={1}
            value={manualPath}
            onChange={(e) => setManualPath(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualGo()}
            placeholder="/home/user/Music"
          />
          <Button variant="light" onClick={handleManualGo}>
            Go
          </Button>
        </Group>

        {error && (
          <Text size="sm" c="red">{error}</Text>
        )}

        <ScrollArea h={350} offsetScrollbars>
          {loading ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
            </Group>
          ) : data ? (
            <Stack gap={2}>
              {data.parent && (
                <UnstyledButton
                  onClick={() => browse(data.parent!)}
                  py={6}
                  px="sm"
                  style={{ borderRadius: 4 }}
                  className="folder-item"
                >
                  <Group gap="xs">
                    <IconArrowUp size={16} color="gray" />
                    <Text size="sm" c="dimmed">..</Text>
                  </Group>
                </UnstyledButton>
              )}
              {data.directories.length === 0 && (
                <Text size="sm" c="dimmed" ta="center" py="md">
                  No subdirectories
                </Text>
              )}
              {data.directories.map((dir) => (
                <UnstyledButton
                  key={dir.path}
                  onClick={() => browse(dir.path)}
                  py={6}
                  px="sm"
                  style={{ borderRadius: 4 }}
                  className="folder-item"
                >
                  <Group gap="xs">
                    <IconFolder size={16} color="var(--mantine-color-blue-5)" />
                    <Text size="sm">{dir.name}</Text>
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          ) : null}
        </ScrollArea>

        <Group gap="xs" justify="space-between">
          <Text size="xs" c="dimmed" truncate flex={1}>{currentPath}</Text>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>Cancel</Button>
            <Button leftSection={<IconCheck size={16} />} onClick={handleSelect}>
              Select
            </Button>
          </Group>
        </Group>
      </Stack>

      <style>{`
        .folder-item:hover {
          background: var(--mantine-color-gray-1);
        }
        [data-mantine-color-scheme="dark"] .folder-item:hover {
          background: var(--mantine-color-dark-5);
        }
      `}</style>
    </Modal>
  );
}
