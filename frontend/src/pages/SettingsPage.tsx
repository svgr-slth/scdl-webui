import {
  Title,
  TextInput,
  Select,
  Button,
  Stack,
  Card,
  PasswordInput,
  Alert,
  Group,
  Modal,
  Text,
  Progress,
} from "@mantine/core";
import { IconCheck, IconFolder, IconAlertTriangle } from "@tabler/icons-react";
import { useSettings, useUpdateSettings } from "../hooks/useSettings";
import { settingsApi, type MoveCheckResult } from "../api/settings";
import { FolderPicker } from "../components/FolderPicker";
import { SyncLogViewer } from "../components/SyncLogViewer";
import { useMoveWebSocket, type MoveStatus } from "../hooks/useMoveWebSocket";
import { useState, useEffect, useRef } from "react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [authToken, setAuthToken] = useState("");
  const [defaultFormat, setDefaultFormat] = useState("mp3");
  const [nameFormat, setNameFormat] = useState("");
  const [musicRoot, setMusicRoot] = useState("");
  const [saved, setSaved] = useState(false);
  const [folderPickerOpened, setFolderPickerOpened] = useState(false);

  // Move library state
  const [moveConfirmOpened, setMoveConfirmOpened] = useState(false);
  const [moveCheck, setMoveCheck] = useState<MoveCheckResult | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [checkingMove, setCheckingMove] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const originalMusicRoot = useRef("");

  const {
    logs: moveLogs,
    status: moveStatus,
    error: moveWsError,
    progress: moveProgress,
    clear: clearMove,
  } = useMoveWebSocket(isMoving);

  useEffect(() => {
    if (settings) {
      setAuthToken(settings.auth_token || "");
      setDefaultFormat(settings.default_audio_format || "mp3");
      setNameFormat(settings.default_name_format || "");
      setMusicRoot(settings.music_root || "");
      originalMusicRoot.current = settings.music_root || "";
    }
  }, [settings]);

  // When move completes, update the original ref so re-saving doesn't trigger another move
  useEffect(() => {
    if (moveStatus === "completed") {
      originalMusicRoot.current = musicRoot;
    }
  }, [moveStatus, musicRoot]);

  const handleSave = async () => {
    setMoveError(null);
    const musicRootChanged =
      musicRoot !== originalMusicRoot.current &&
      musicRoot.trim() !== "" &&
      originalMusicRoot.current.trim() !== "";

    if (musicRootChanged) {
      setCheckingMove(true);
      try {
        const check = await settingsApi.moveCheck(musicRoot);
        if (check.needs_move) {
          setMoveCheck(check);
          setMoveConfirmOpened(true);
          setCheckingMove(false);
          return;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setMoveError(msg);
        setCheckingMove(false);
        return;
      }
      setCheckingMove(false);
    }

    // Normal save (no move needed or music_root unchanged)
    await saveSettings();
  };

  const saveSettings = async () => {
    await updateSettings.mutateAsync({
      auth_token: authToken || null,
      default_audio_format: defaultFormat,
      default_name_format: nameFormat || null,
      music_root: musicRoot || null,
    });
    originalMusicRoot.current = musicRoot;
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleConfirmMove = async () => {
    setMoveConfirmOpened(false);
    clearMove();
    setIsMoving(true);

    try {
      // Save non-music-root settings first
      await updateSettings.mutateAsync({
        auth_token: authToken || null,
        default_audio_format: defaultFormat,
        default_name_format: nameFormat || null,
      });
      // Start the move (updates music_root in DB on completion)
      await settingsApi.moveLibrary(musicRoot);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMoveError(msg);
      setIsMoving(false);
    }
  };

  if (isLoading) return <Title order={3}>Loading...</Title>;

  const moveActive =
    isMoving &&
    moveStatus !== "completed" &&
    moveStatus !== "failed" &&
    moveStatus !== "idle";

  const statusLabel: Record<MoveStatus, string> = {
    idle: "Preparing...",
    scanning: "Scanning files...",
    moving: "Moving files...",
    rewriting: "Updating references...",
    completed: "Completed",
    failed: "Failed",
  };

  return (
    <>
      <Title order={2} mb="lg">
        Settings
      </Title>
      <Card withBorder p="lg" maw={600}>
        <Stack gap="md">
          <div>
            <Group gap="xs" align="flex-end">
              <TextInput
                flex={1}
                label="Music Root Path"
                value={musicRoot}
                onChange={(e) => setMusicRoot(e.currentTarget.value)}
                placeholder="/home/user/Music"
                description="Absolute path where music files are downloaded"
              />
              <Button
                variant="light"
                leftSection={<IconFolder size={16} />}
                onClick={() => setFolderPickerOpened(true)}
              >
                Browse
              </Button>
            </Group>
          </div>
          <FolderPicker
            opened={folderPickerOpened}
            onClose={() => setFolderPickerOpened(false)}
            onSelect={setMusicRoot}
            initialPath={musicRoot || "/"}
          />
          <PasswordInput
            label="SoundCloud Auth Token"
            value={authToken}
            onChange={(e) => setAuthToken(e.currentTarget.value)}
            placeholder="Your SoundCloud auth token"
            description="Required for downloading likes and private tracks"
          />
          <Select
            label="Default Audio Format"
            data={[
              { value: "mp3", label: "MP3" },
              { value: "flac", label: "FLAC" },
              { value: "opus", label: "Opus" },
            ]}
            value={defaultFormat}
            onChange={(v) => setDefaultFormat(v || "mp3")}
          />
          <TextInput
            label="Default Name Format"
            value={nameFormat}
            onChange={(e) => setNameFormat(e.currentTarget.value)}
            placeholder="{artist} - {title}"
            description="Default naming pattern for downloaded files"
          />
          <Button
            onClick={handleSave}
            loading={updateSettings.isPending || checkingMove}
            disabled={moveActive}
          >
            Save Settings
          </Button>
          {saved && (
            <Alert color="green" icon={<IconCheck size={16} />}>
              Settings saved successfully
            </Alert>
          )}
          {moveError && !isMoving && (
            <Alert color="red">{moveError}</Alert>
          )}
        </Stack>
      </Card>

      {/* Move progress card */}
      {isMoving && (
        <Card withBorder p="lg" maw={600} mt="md">
          <Title order={4} mb="sm">
            Moving Music Library
          </Title>
          <Text size="sm" c="dimmed" mb="sm">
            {statusLabel[moveStatus]}
          </Text>
          {moveProgress && moveProgress.total > 0 && (
            <Stack gap={4} mb="sm">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {moveProgress.current} / {moveProgress.total} files
                </Text>
                <Text size="sm" c="dimmed">
                  {Math.round(
                    (moveProgress.current / moveProgress.total) * 100
                  )}
                  %
                </Text>
              </Group>
              <Progress
                value={(moveProgress.current / moveProgress.total) * 100}
                size="lg"
                radius="md"
                animated={moveActive}
              />
            </Stack>
          )}
          <SyncLogViewer logs={moveLogs} height={200} />
          {moveStatus === "completed" && (
            <Alert color="green" mt="sm" icon={<IconCheck size={16} />}>
              Library moved successfully
            </Alert>
          )}
          {moveStatus === "failed" && (
            <Alert color="red" mt="sm">
              Move failed{moveWsError ? `: ${moveWsError}` : ""}
            </Alert>
          )}
          {(moveStatus === "completed" || moveStatus === "failed") && (
            <Button
              variant="light"
              mt="sm"
              onClick={() => setIsMoving(false)}
            >
              Dismiss
            </Button>
          )}
        </Card>
      )}

      {/* Move confirmation dialog */}
      <Modal
        opened={moveConfirmOpened}
        onClose={() => setMoveConfirmOpened(false)}
        title="Move Music Library"
        size="md"
      >
        <Stack gap="md">
          <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
            The music root path has changed. Existing files will be moved to the
            new location.
          </Alert>
          {moveCheck && (
            <Stack gap="xs">
              <Text>
                <strong>Sources with files:</strong> {moveCheck.source_count}
              </Text>
              <Text>
                <strong>Total files:</strong> {moveCheck.total_files}
              </Text>
              <Text>
                <strong>Total size:</strong> {formatBytes(moveCheck.total_size)}
              </Text>
            </Stack>
          )}
          <Text size="sm" c="dimmed">
            Files will be copied to the new location and verified before
            removing the originals. Syncing will be blocked during the move.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setMoveConfirmOpened(false)}
            >
              Cancel
            </Button>
            <Button color="yellow" onClick={handleConfirmMove}>
              Move Library
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
