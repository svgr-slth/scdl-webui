import { Title, Button, Group, Modal, Table, ActionIcon, Alert, Stack, Text, Checkbox } from "@mantine/core";
import { IconPlus, IconTrash, IconEdit } from "@tabler/icons-react";
import { useState } from "react";
import { useSources, useCreateSource, useDeleteSource } from "../hooks/useSources";
import { SourceForm } from "../components/SourceForm";
import { StatusBadge } from "../components/StatusBadge";
import type { SourceCreate } from "../types/source";
import { useNavigate } from "react-router-dom";

export function SourcesPage() {
  const { data: sources, isLoading } = useSources();
  const createSource = useCreateSource();
  const deleteSource = useDeleteSource();
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);

  // Delete confirmation modal state
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);

  const handleCreate = async (data: SourceCreate) => {
    await createSource.mutateAsync(data as SourceCreate);
    setOpened(false);
  };

  if (isLoading) return <Title order={3}>Loading...</Title>;

  return (
    <>
      <Group justify="space-between" mb="lg">
        <Title order={2}>Sources</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setOpened(true)}>
          Add Source
        </Button>
      </Group>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Add Source" size="lg">
        <SourceForm onSubmit={handleCreate} loading={createSource.isPending} />
      </Modal>

      <Modal
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Delete Source"
        size="sm"
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
          </Text>
          <Text size="sm" c="dimmed">
            Archive and sync files will be deleted automatically.
          </Text>
          <Checkbox
            label="Also delete downloaded music files"
            checked={deleteFiles}
            onChange={(e) => setDeleteFiles(e.currentTarget.checked)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteModalOpened(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteSource.isPending}
              onClick={async () => {
                if (deleteTarget) {
                  await deleteSource.mutateAsync({
                    id: deleteTarget.id,
                    deleteFiles,
                  });
                  setDeleteModalOpened(false);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {sources && sources.length === 0 ? (
        <Alert>No sources yet. Click "Add Source" to get started.</Alert>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Folder</Table.Th>
              <Table.Th>Format</Table.Th>
              <Table.Th>Last Sync</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sources?.map((s) => (
              <Table.Tr key={s.id} style={{ cursor: "pointer" }}>
                <Table.Td onClick={() => navigate(`/sources/${s.id}`)}>{s.name}</Table.Td>
                <Table.Td>{s.source_type}</Table.Td>
                <Table.Td>{s.local_folder}</Table.Td>
                <Table.Td>{s.audio_format.toUpperCase()}</Table.Td>
                <Table.Td>
                  {s.last_sync_status ? <StatusBadge status={s.last_sync_status} /> : "Never"}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <ActionIcon variant="subtle" onClick={() => navigate(`/sources/${s.id}`)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: s.id, name: s.name });
                        setDeleteFiles(false);
                        setDeleteModalOpened(true);
                      }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
