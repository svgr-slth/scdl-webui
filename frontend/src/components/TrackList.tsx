import {
  Table,
  ActionIcon,
  Text,
  ScrollArea,
  Progress,
  Badge,
  Menu,
} from "@mantine/core";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconDots,
  IconRefresh,
} from "@tabler/icons-react";
import { useState, useRef, useCallback, useEffect } from "react";
import type { TrackFile } from "../types/source";
import { sourcesApi } from "../api/sources";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const statusBadge = {
  synced: { color: "green", label: "synced" },
  missing: { color: "orange", label: "missing" },
  untracked: { color: "gray", label: "untracked" },
} as const;

interface Props {
  sourceId: number;
  tracks: TrackFile[];
  onDeleteTrack: (path: string, trackId: string | null) => void;
}

export function TrackList({
  sourceId,
  tracks,
  onDeleteTrack,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const handlePlay = useCallback(
    (track: TrackFile) => {
      if (!track.relative_path) return;
      const audio = audioRef.current;
      if (!audio) return;

      if (currentPath === track.relative_path) {
        if (isPlaying) {
          audio.pause();
        } else {
          audio.play();
        }
        return;
      }

      audio.src = sourcesApi.trackStreamUrl(sourceId, track.relative_path);
      audio.play();
      setCurrentPath(track.relative_path);
      setIsPlaying(true);
      setProgress(0);
    },
    [sourceId, currentPath, isPlaying],
  );

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };
    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, []);

  if (tracks.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="lg">
        No tracks yet
      </Text>
    );
  }

  return (
    <>
      <audio ref={audioRef} preload="none" />
      <ScrollArea.Autosize mah={500}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40} />
              <Table.Th>Name</Table.Th>
              <Table.Th w={80}>Status</Table.Th>
              <Table.Th w={80}>Size</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tracks.map((track) => {
              const hasFile = !!track.relative_path;
              const isActive = hasFile && currentPath === track.relative_path;
              const badge = statusBadge[track.status];
              return (
                <Table.Tr
                  key={track.relative_path || track.track_id || track.name}
                  style={{
                    ...(isActive
                      ? { backgroundColor: "var(--mantine-color-blue-light)" }
                      : {}),
                    ...(track.status === "missing"
                      ? { opacity: 0.6, fontStyle: "italic" }
                      : {}),
                  }}
                >
                  <Table.Td>
                    {hasFile ? (
                      <ActionIcon
                        variant={isActive && isPlaying ? "filled" : "subtle"}
                        color="blue"
                        size="sm"
                        onClick={() => handlePlay(track)}
                      >
                        {isActive && isPlaying ? (
                          <IconPlayerPause size={14} />
                        ) : (
                          <IconPlayerPlay size={14} />
                        )}
                      </ActionIcon>
                    ) : (
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        disabled
                      >
                        <IconPlayerPlay size={14} />
                      </ActionIcon>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" truncate>
                      {track.name}
                    </Text>
                    {isActive && (
                      <div onClick={handleSeek} style={{ cursor: "pointer" }}>
                        <Progress
                          value={progress}
                          size={3}
                          mt={4}
                          radius="xl"
                        />
                      </div>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge size="xs" color={badge.color} variant="light">
                      {badge.label}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {hasFile && (
                      <Text size="xs" c="dimmed">
                        {formatSize(track.size)}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" size="sm">
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {hasFile && (
                          <Menu.Item
                            leftSection={<IconRefresh size={14} />}
                            onClick={() => onDeleteTrack(track.relative_path!, track.track_id)}
                          >
                            Force re-download
                          </Menu.Item>
                        )}
                        {track.status === "missing" && (
                          <Menu.Item disabled>
                            Will re-download on next sync
                          </Menu.Item>
                        )}
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </>
  );
}
