import { Badge, Button, Checkbox, Group, Select, Stack, TextInput, Anchor } from "@mantine/core";
import { useState, useRef } from "react";
import type { SourceCreate } from "../types/source";

const allSourceTypes = [
  { value: "playlist", label: "Playlist" },
  { value: "artist_tracks", label: "Artist - Uploads" },
  { value: "artist_all", label: "Artist - All (uploads + reposts)" },
  { value: "likes", label: "Likes" },
  { value: "user_reposts", label: "Reposts" },
];

const profileSourceTypes = allSourceTypes.filter((t) => t.value !== "playlist");

const audioFormats = [
  { value: "mp3", label: "MP3" },
  { value: "flac", label: "FLAC" },
  { value: "opus", label: "Opus" },
];

type DetectedType = "playlist" | "profile" | "track" | null;

function parseScUrl(raw: string): { user: string; slug: string; detected: DetectedType } {
  try {
    const url = new URL(raw);
    if (!url.hostname.includes("soundcloud.com")) return { user: "", slug: "", detected: null };
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[1] === "sets") {
      return { user: parts[0], slug: parts[2], detected: "playlist" };
    }
    if (parts.length === 1) {
      return { user: parts[0], slug: "", detected: "profile" };
    }
    if (parts.length === 2) {
      return { user: parts[0], slug: parts[1], detected: "track" };
    }
  } catch {
    /* invalid URL */
  }
  return { user: "", slug: "", detected: null };
}

interface Props {
  initial?: Partial<SourceCreate>;
  onSubmit: (data: SourceCreate) => void;
  loading?: boolean;
  submitLabel?: string;
}

export function SourceForm({ initial, onSubmit, loading, submitLabel = "Create" }: Props) {
  const isEditing = !!initial?.url;
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [sourceType, setSourceType] = useState(initial?.source_type ?? "playlist");
  const [localFolder, setLocalFolder] = useState(initial?.local_folder ?? "");
  const [audioFormat, setAudioFormat] = useState(initial?.audio_format ?? "mp3");
  const [nameFormat, setNameFormat] = useState(initial?.name_format ?? "");
  const [syncEnabled, setSyncEnabled] = useState(initial?.sync_enabled ?? true);
  const [originalArt, setOriginalArt] = useState(initial?.original_art ?? true);
  const [extractArtist, setExtractArtist] = useState(initial?.extract_artist ?? false);

  const [detectedType, setDetectedType] = useState<DetectedType>(() => {
    if (initial?.url) return parseScUrl(initial.url).detected;
    return null;
  });
  const [typeOverride, setTypeOverride] = useState(false);

  // Track whether user has manually edited name/folder
  const nameTouched = useRef(isEditing || !!initial?.name);
  const folderTouched = useRef(isEditing || !!initial?.local_folder);

  const handleUrlChange = (raw: string) => {
    setUrl(raw);
    const { user, slug, detected } = parseScUrl(raw);
    setDetectedType(detected);
    setTypeOverride(false);

    if (detected === "playlist") {
      setSourceType("playlist");
      if (!nameTouched.current && slug) setName(slug.replace(/-/g, " "));
      if (!folderTouched.current && user && slug) setLocalFolder(`${user}/${slug}`);
    } else if (detected === "profile") {
      // Switch away from playlist if currently selected
      if (sourceType === "playlist") setSourceType("artist_tracks");
      if (!nameTouched.current && user) setName(user);
      if (!folderTouched.current && user) setLocalFolder(user);
    } else if (detected === "track") {
      if (!nameTouched.current && slug) setName(slug.replace(/-/g, " "));
      if (!folderTouched.current && user) setLocalFolder(`${user}/${slug}`);
    }
  };

  // Determine which type options to show
  const showTypeSelector = detectedType !== "playlist" || typeOverride;
  const typeOptions = detectedType === "profile" && !typeOverride ? profileSourceTypes : allSourceTypes;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      url,
      source_type: sourceType,
      local_folder: localFolder,
      audio_format: audioFormat,
      name_format: nameFormat || null,
      sync_enabled: syncEnabled,
      original_art: originalArt,
      extract_artist: extractArtist,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack gap="sm">
        <TextInput
          label="SoundCloud URL"
          required
          value={url}
          onChange={(e) => handleUrlChange(e.currentTarget.value)}
          placeholder="https://soundcloud.com/user/sets/playlist"
        />
        {showTypeSelector ? (
          <Select
            label="Source Type"
            data={typeOptions}
            value={sourceType}
            onChange={(v) => setSourceType(v || "playlist")}
          />
        ) : (
          <Group gap="xs">
            <Badge color="blue" variant="light" size="lg">Playlist (auto-detected)</Badge>
            <Anchor size="xs" onClick={() => setTypeOverride(true)}>Change</Anchor>
          </Group>
        )}
        <TextInput
          label="Name"
          required
          value={name}
          onChange={(e) => { nameTouched.current = true; setName(e.currentTarget.value); }}
          placeholder="My Techno Playlist"
        />
        <TextInput
          label="Local Folder"
          required
          value={localFolder}
          onChange={(e) => { folderTouched.current = true; setLocalFolder(e.currentTarget.value); }}
          placeholder="artist-name/playlist-name"
          description="Relative path under the music directory"
        />
        <Select label="Audio Format" data={audioFormats} value={audioFormat} onChange={(v) => setAudioFormat(v || "mp3")} />
        <TextInput label="Name Format" value={nameFormat} onChange={(e) => setNameFormat(e.currentTarget.value)} placeholder="{artist} - {title}" description="Optional. Leave empty for default" />
        <Group>
          <Checkbox label="Enabled for Sync All" checked={syncEnabled} onChange={(e) => setSyncEnabled(e.currentTarget.checked)} />
          <Checkbox label="Original Art" checked={originalArt} onChange={(e) => setOriginalArt(e.currentTarget.checked)} />
          <Checkbox label="Extract Artist" checked={extractArtist} onChange={(e) => setExtractArtist(e.currentTarget.checked)} />
        </Group>
        <Button type="submit" loading={loading}>{submitLabel}</Button>
      </Stack>
    </form>
  );
}
