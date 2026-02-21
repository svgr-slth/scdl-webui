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

  // Show wizard on first launch — wait for settings to load, then check flag
  if (!isLoading && settings && !settings.onboarding_complete) {
    return <OnboardingWizard defaultMusicRoot={settings.music_root ?? ""} />;
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
