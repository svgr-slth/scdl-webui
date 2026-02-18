import { Badge } from "@mantine/core";

const colors: Record<string, string> = {
  completed: "green",
  running: "blue",
  failed: "red",
  cancelled: "yellow",
  idle: "gray",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge color={colors[status] || "gray"} variant="light">
      {status}
    </Badge>
  );
}
