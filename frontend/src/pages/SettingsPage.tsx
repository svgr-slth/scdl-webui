import { Title, TextInput, Select, Button, Stack, Card, PasswordInput, Alert } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { useSettings, useUpdateSettings } from "../hooks/useSettings";
import { useState, useEffect } from "react";

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [authToken, setAuthToken] = useState("");
  const [defaultFormat, setDefaultFormat] = useState("mp3");
  const [nameFormat, setNameFormat] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setAuthToken(settings.auth_token || "");
      setDefaultFormat(settings.default_audio_format || "mp3");
      setNameFormat(settings.default_name_format || "");
    }
  }, [settings]);

  const handleSave = async () => {
    await updateSettings.mutateAsync({
      auth_token: authToken || null,
      default_audio_format: defaultFormat,
      default_name_format: nameFormat || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (isLoading) return <Title order={3}>Loading...</Title>;

  return (
    <>
      <Title order={2} mb="lg">Settings</Title>
      <Card withBorder p="lg" maw={600}>
        <Stack gap="md">
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
          <Button onClick={handleSave} loading={updateSettings.isPending}>
            Save Settings
          </Button>
          {saved && (
            <Alert color="green" icon={<IconCheck size={16} />}>
              Settings saved successfully
            </Alert>
          )}
        </Stack>
      </Card>
    </>
  );
}
