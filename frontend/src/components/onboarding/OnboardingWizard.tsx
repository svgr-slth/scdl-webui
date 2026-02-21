import { Box, Card, Group, Button, Text, Stack } from "@mantine/core";
import { IconArrowLeft, IconArrowRight, IconCheck, IconPlayerSkipForward } from "@tabler/icons-react";
import { useState } from "react";
import { useUpdateSettings } from "../../hooks/useSettings";
import { useRekordboxStatus } from "../../hooks/useRekordbox";
import { WelcomeStep } from "./steps/WelcomeStep";
import { MusicRootStep } from "./steps/MusicRootStep";
import { AuthTokenStep } from "./steps/AuthTokenStep";
import { AutoSyncStep } from "./steps/AutoSyncStep";
import { RekordboxStep } from "./steps/RekordboxStep";
import { DoneStep } from "./steps/DoneStep";

const STEPS = ["welcome", "music_root", "auth_token", "auto_sync", "rekordbox", "done"] as const;
type Step = (typeof STEPS)[number];

// Steps that count in the progress indicator (exclude welcome & done)
const PROGRESS_STEPS: Step[] = ["music_root", "auth_token", "auto_sync", "rekordbox"];

interface WizardState {
  musicRoot: string;
  authToken: string;
  autoSyncEnabled: boolean;
  autoSyncInterval: number;
  rekordboxXmlPath: string;
  rekordboxSkipped: boolean;
}

interface Props {
  defaultMusicRoot: string;
}

export function OnboardingWizard({ defaultMusicRoot }: Props) {
  const updateSettings = useUpdateSettings();
  const { data: rbStatus } = useRekordboxStatus();

  const [step, setStep] = useState<Step>("welcome");
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [animKey, setAnimKey] = useState(0);
  const [rekordboxSubStep, setRekordboxSubStep] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const [state, setState] = useState<WizardState>({
    musicRoot: defaultMusicRoot,
    authToken: "",
    autoSyncEnabled: false,
    autoSyncInterval: 60,
    rekordboxXmlPath: "",
    rekordboxSkipped: false,
  });

  const stepIndex = STEPS.indexOf(step);

  const goTo = (target: Step, dir: "next" | "prev") => {
    setDirection(dir);
    setAnimKey((k) => k + 1);
    setStep(target);
  };

  const handleNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) goTo(next, "next");
  };

  const handleBack = () => {
    if (step === "rekordbox" && rekordboxSubStep > 0) {
      setRekordboxSubStep((s) => s - 1);
      return;
    }
    const prev = STEPS[stepIndex - 1];
    if (prev) goTo(prev, "prev");
  };

  const handleRekordboxNext = () => {
    if (rekordboxSubStep < 2) {
      setRekordboxSubStep((s) => s + 1);
    } else {
      goTo("done", "next");
    }
  };

  const handleSkipRekordbox = () => {
    setState((s) => ({ ...s, rekordboxSkipped: true, rekordboxXmlPath: "" }));
    goTo("done", "next");
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      await updateSettings.mutateAsync({
        music_root: state.musicRoot || undefined,
        auth_token: state.authToken || undefined,
        auto_sync_enabled: state.autoSyncEnabled,
        auto_sync_interval_minutes: state.autoSyncInterval,
        rekordbox_xml_path: state.rekordboxSkipped ? undefined : state.rekordboxXmlPath || undefined,
        onboarding_complete: true,
      });
    } finally {
      setFinishing(false);
    }
  };

  const slideAnim =
    direction === "next"
      ? "slideInRight 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both"
      : "slideInLeft 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94) both";

  const detectedRbPath =
    rbStatus?.detected_paths && rbStatus.detected_paths.length > 0
      ? rbStatus.detected_paths[0]
      : null;

  return (
    <>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Full-screen overlay */}
      <Box
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "var(--mantine-color-dark-8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <Card
          withBorder
          radius="lg"
          p="xl"
          style={{
            width: "100%",
            maxWidth: 560,
            minHeight: 480,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header: logo + progress */}
          <Stack gap="md" mb="xl">
            <Group justify="space-between" align="center">
              <Text fw={700} size="sm" c="dimmed">
                scdl-web
              </Text>
              {step !== "welcome" && step !== "done" && (
                <Text size="xs" c="dimmed">
                  Step {PROGRESS_STEPS.indexOf(step) + 1} of {PROGRESS_STEPS.length}
                </Text>
              )}
            </Group>

            {/* Progress dots */}
            {step !== "welcome" && step !== "done" && (
              <Group gap={6} justify="center">
                {PROGRESS_STEPS.map((s, i) => {
                  const currentIdx = PROGRESS_STEPS.indexOf(step);
                  return (
                    <Box
                      key={s}
                      style={{
                        width: i === currentIdx ? 20 : 8,
                        height: 8,
                        borderRadius: 4,
                        background:
                          i <= currentIdx
                            ? "var(--mantine-color-blue-5)"
                            : "var(--mantine-color-dark-4)",
                        transition: "all 300ms ease",
                      }}
                    />
                  );
                })}
              </Group>
            )}
          </Stack>

          {/* Step content — animated on step change */}
          <Box key={animKey} style={{ flex: 1, animation: slideAnim }}>
            {step === "welcome" && <WelcomeStep />}
            {step === "music_root" && (
              <MusicRootStep
                value={state.musicRoot}
                onChange={(v) => setState((s) => ({ ...s, musicRoot: v }))}
              />
            )}
            {step === "auth_token" && (
              <AuthTokenStep
                value={state.authToken}
                onChange={(v) => setState((s) => ({ ...s, authToken: v }))}
              />
            )}
            {step === "auto_sync" && (
              <AutoSyncStep
                enabled={state.autoSyncEnabled}
                interval={state.autoSyncInterval}
                onEnabledChange={(v) => setState((s) => ({ ...s, autoSyncEnabled: v }))}
                onIntervalChange={(v) => setState((s) => ({ ...s, autoSyncInterval: v }))}
              />
            )}
            {step === "rekordbox" && (
              <RekordboxStep
                value={state.rekordboxXmlPath}
                onChange={(v) => setState((s) => ({ ...s, rekordboxXmlPath: v }))}
                detectedPath={detectedRbPath}
                subStep={rekordboxSubStep}
                onSubStepChange={setRekordboxSubStep}
              />
            )}
            {step === "done" && <DoneStep />}
          </Box>

          {/* Navigation footer */}
          <Group justify="space-between" mt="xl">
            {/* Back button */}
            <Box>
              {step !== "welcome" && step !== "done" && (
                <Button
                  variant="subtle"
                  color="gray"
                  leftSection={<IconArrowLeft size={16} />}
                  onClick={handleBack}
                >
                  Back
                </Button>
              )}
            </Box>

            {/* Right-side actions */}
            <Group gap="xs">
              {step === "welcome" && (
                <Button
                  rightSection={<IconArrowRight size={16} />}
                  onClick={handleNext}
                >
                  Get started
                </Button>
              )}

              {(step === "auth_token") && (
                <Button variant="subtle" color="gray" onClick={handleNext}>
                  Skip
                </Button>
              )}

              {step === "rekordbox" && (
                <Button
                  variant="subtle"
                  color="gray"
                  leftSection={<IconPlayerSkipForward size={16} />}
                  onClick={handleSkipRekordbox}
                >
                  Skip Rekordbox
                </Button>
              )}

              {step === "music_root" && (
                <Button rightSection={<IconArrowRight size={16} />} onClick={handleNext}>
                  Next
                </Button>
              )}

              {step === "auto_sync" && (
                <Button rightSection={<IconArrowRight size={16} />} onClick={handleNext}>
                  Next
                </Button>
              )}

              {step === "rekordbox" && (
                <Button
                  rightSection={rekordboxSubStep < 2 ? <IconArrowRight size={16} /> : <IconCheck size={16} />}
                  onClick={handleRekordboxNext}
                >
                  {rekordboxSubStep < 2 ? "Next" : "Done"}
                </Button>
              )}

              {step === "done" && (
                <Button
                  leftSection={<IconCheck size={16} />}
                  loading={finishing}
                  onClick={handleFinish}
                >
                  Go to Dashboard
                </Button>
              )}
            </Group>
          </Group>
        </Card>
      </Box>
    </>
  );
}
