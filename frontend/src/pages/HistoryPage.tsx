import { Title, Table, Modal, Code, ScrollArea, Alert } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { historyApi } from "../api/history";
import { StatusBadge } from "../components/StatusBadge";
import { useState } from "react";
import type { SyncRunDetail } from "../types/sync";

export function HistoryPage() {
  const { data: runs, isLoading } = useQuery({
    queryKey: ["history"],
    queryFn: () => historyApi.list(),
  });
  const [selectedRun, setSelectedRun] = useState<SyncRunDetail | null>(null);

  const openDetail = async (runId: number) => {
    const detail = await historyApi.get(runId);
    setSelectedRun(detail);
  };

  if (isLoading) return <Title order={3}>Loading...</Title>;

  return (
    <>
      <Title order={2} mb="lg">Sync History</Title>

      <Modal
        opened={!!selectedRun}
        onClose={() => setSelectedRun(null)}
        title={`Sync Run #${selectedRun?.id}`}
        size="xl"
      >
        {selectedRun && (
          <ScrollArea h={400}>
            <Code block>{selectedRun.log_output || "No output captured"}</Code>
          </ScrollArea>
        )}
      </Modal>

      {runs && runs.length === 0 ? (
        <Alert>No sync history yet.</Alert>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Source</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Started</Table.Th>
              <Table.Th>Added</Table.Th>
              <Table.Th>Removed</Table.Th>
              <Table.Th>Skipped</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {runs?.map((run) => (
              <Table.Tr key={run.id} style={{ cursor: "pointer" }} onClick={() => openDetail(run.id)}>
                <Table.Td>{run.source_name || `Source #${run.source_id}`}</Table.Td>
                <Table.Td><StatusBadge status={run.status} /></Table.Td>
                <Table.Td>{new Date(run.started_at).toLocaleString()}</Table.Td>
                <Table.Td>{run.tracks_added}</Table.Td>
                <Table.Td>{run.tracks_removed}</Table.Td>
                <Table.Td>{run.tracks_skipped}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
