import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { SourceDetail } from "./pages/SourceDetail";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard";
import { useSettings } from "./hooks/useSettings";

export function App() {
  const { data: settings, isLoading } = useSettings();
  // Local flag set immediately when the wizard finishes — avoids any race
  // between React Query cache updates and re-renders.
  const [wizardDone, setWizardDone] = useState(false);

  if (!isLoading && settings && !settings.onboarding_complete && !wizardDone) {
    return (
      <OnboardingWizard
        defaultMusicRoot={settings.music_root ?? ""}
        defaultAuthToken={settings.auth_token ?? ""}
        defaultAutoSyncEnabled={settings.auto_sync_enabled ?? false}
        defaultAutoSyncInterval={settings.auto_sync_interval_minutes ?? 60}
        defaultRekordboxXmlPath={settings.rekordbox_xml_path ?? ""}
        onDone={() => setWizardDone(true)}
      />
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sources/:id" element={<SourceDetail />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
