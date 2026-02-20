package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"sync"
	"time"

	gorilla "github.com/gorilla/websocket"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct manages the application lifecycle.
type App struct {
	ctx              context.Context
	backendCmd       *exec.Cmd
	quitting         bool // true = real quit from tray, false = hide-to-tray on window close
	syncWatchCancels sync.Map
	moveWatchCancel  context.CancelFunc
	moveWatchMu      sync.Mutex
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. It sets up the backend.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Always re-extract backend Python files so upgrades take effect immediately.
	if err := extractBackendFiles(); err != nil {
		runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Setup Failed",
			Message: fmt.Sprintf("Failed to extract backend files:\n\n%v", err),
		})
		return
	}

	// First-run setup: create venv and install deps (skipped if venv already exists).
	if !isSetupComplete() {
		log.Println("First run detected, running setup...")
		if err := runFirstTimeSetup(); err != nil {
			runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
				Type:    runtime.ErrorDialog,
				Title:   "Setup Failed",
				Message: fmt.Sprintf("Failed to set up scdl-web:\n\n%v", err),
			})
			return
		}
	}

	// Ensure .env and data directories exist (idempotent, safe on every startup).
	createEnvFile()
	createDataDirs()

	// Verify Python dependencies are installed (handles partial pip failures)
	if !checkDeps() {
		log.Println("Dependencies missing, running pip install...")
		if err := pipInstall(); err != nil {
			runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
				Type:    runtime.ErrorDialog,
				Title:   "Dependency Error",
				Message: fmt.Sprintf("Failed to install Python dependencies:\n\n%v", err),
			})
			return
		}
		if !checkDeps() {
			runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
				Type:    runtime.ErrorDialog,
				Title:   "Dependency Error",
				Message: "Python dependencies could not be installed.\nPlease check your internet connection and try again.",
			})
			return
		}
	}

	// Check Python and FFmpeg
	if !checkPython() {
		runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Python Not Found",
			Message: "Python 3.10+ is required but was not found.\n\nPlease install Python 3.10 or later and restart the application.",
		})
		return
	}
	if !checkFFmpeg() {
		runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.WarningDialog,
			Title:   "FFmpeg Not Found",
			Message: "FFmpeg is not installed. Audio conversion features may not work.\n\nPlease install FFmpeg for full functionality.",
		})
	}

	// Start Python backend
	log.Println("Starting backend...")
	envVars := readEnvFile(envFile())
	cmd, err := startBackend(envVars)
	if err != nil {
		runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Backend Error",
			Message: fmt.Sprintf("Failed to start the backend:\n\n%v", err),
		})
		return
	}
	a.backendCmd = cmd

	// Wait for backend to be ready
	if !waitForBackend(30 * time.Second) {
		stopBackend(a.backendCmd)
		runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Backend Timeout",
			Message: "The backend failed to start within 30 seconds.",
		})
		return
	}
	log.Println("Backend is ready")

	// Watch for backend process death
	go func() {
		a.backendCmd.Wait()
		log.Println("Backend process exited unexpectedly")
	}()
}

// shutdown is called when the app is closing.
func (a *App) shutdown(ctx context.Context) {
	log.Println("Shutting down...")
	stopBackend(a.backendCmd)
}

// WatchSync opens a WebSocket connection to the backend and relays messages
// to the frontend via Wails events. Called by the frontend when it wants
// live sync updates (replaces direct WebSocket, which WebView2 blocks).
// Blocks until the WS connection is established (or fails/times out) so that
// the frontend knows the relay is ready before triggering the sync.
func (a *App) WatchSync(sourceId int) {
	ready := make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	a.syncWatchCancels.Store(sourceId, cancel)
	go func() {
		defer cancel()
		defer a.syncWatchCancels.Delete(sourceId)
		eventName := fmt.Sprintf("sync:%d", sourceId)
		conn, _, err := gorilla.DefaultDialer.DialContext(ctx,
			fmt.Sprintf("ws://127.0.0.1:8000/ws/sync/%d", sourceId), nil)
		if err != nil {
			log.Printf("[WatchSync:%d] connect failed: %v", sourceId, err)
			runtime.EventsEmit(a.ctx, eventName,
				`{"type":"status","status":"failed","error":"backend unavailable"}`)
			close(ready)
			return
		}
		defer conn.Close()
		log.Printf("[WatchSync:%d] connected", sourceId)
		close(ready)
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				return
			}
			runtime.EventsEmit(a.ctx, eventName, string(raw))
			var msg map[string]interface{}
			if json.Unmarshal(raw, &msg) == nil {
				if t, _ := msg["type"].(string); t == "status" {
					s, _ := msg["status"].(string)
					if s == "completed" || s == "failed" || s == "cancelled" {
						return
					}
				}
			}
		}
	}()
	select {
	case <-ready:
	case <-time.After(5 * time.Second):
		log.Printf("[WatchSync:%d] timeout waiting for WS connection", sourceId)
	}
}

// StopWatchSync cancels the goroutine watching the given source (called on unmount).
func (a *App) StopWatchSync(sourceId int) {
	if v, ok := a.syncWatchCancels.Load(sourceId); ok {
		v.(context.CancelFunc)()
	}
}

// WatchMoveLibrary opens a WebSocket to the backend and relays move-library
// progress messages to the frontend via Wails events (mirrors WatchSync).
// Blocks until the WS connection is established (or fails/times out).
func (a *App) WatchMoveLibrary() {
	ready := make(chan struct{})
	ctx, cancel := context.WithCancel(context.Background())
	a.moveWatchMu.Lock()
	if a.moveWatchCancel != nil {
		a.moveWatchCancel()
	}
	a.moveWatchCancel = cancel
	a.moveWatchMu.Unlock()
	go func() {
		defer cancel()
		conn, _, err := gorilla.DefaultDialer.DialContext(ctx,
			"ws://127.0.0.1:8000/ws/move-library", nil)
		if err != nil {
			log.Printf("[WatchMoveLibrary] connect failed: %v", err)
			runtime.EventsEmit(a.ctx, "move-library",
				`{"type":"status","status":"failed","error":"backend unavailable"}`)
			close(ready)
			return
		}
		defer conn.Close()
		log.Printf("[WatchMoveLibrary] connected")
		close(ready)
		for {
			_, raw, err := conn.ReadMessage()
			if err != nil {
				return
			}
			runtime.EventsEmit(a.ctx, "move-library", string(raw))
			var msg map[string]interface{}
			if json.Unmarshal(raw, &msg) == nil {
				if t, _ := msg["type"].(string); t == "status" {
					s, _ := msg["status"].(string)
					if s == "completed" || s == "failed" {
						return
					}
				}
			}
		}
	}()
	select {
	case <-ready:
	case <-time.After(5 * time.Second):
		log.Printf("[WatchMoveLibrary] timeout waiting for WS connection")
	}
}

// StopWatchMoveLibrary cancels the goroutine watching the move-library operation.
func (a *App) StopWatchMoveLibrary() {
	a.moveWatchMu.Lock()
	defer a.moveWatchMu.Unlock()
	if a.moveWatchCancel != nil {
		a.moveWatchCancel()
		a.moveWatchCancel = nil
	}
}

// GetVersion returns the version string embedded at build time.
func (a *App) GetVersion() string {
	return Version
}

// CheckForUpdate queries GitHub for the latest release and returns update info.
// Returns UpdateInfo{Available: false} when already up to date, in "dev" mode, or on error.
func (a *App) CheckForUpdate() UpdateInfo {
	rel, err := fetchLatestRelease()
	if err != nil || rel.TagName == "" {
		return UpdateInfo{}
	}
	if Version == "dev" || compareVersions(rel.TagName, Version) <= 0 {
		return UpdateInfo{}
	}
	return UpdateInfo{
		Available: true,
		Version:   rel.TagName,
		Notes:     rel.Body,
	}
}

// DownloadAndInstall downloads the platform-appropriate release asset and installs it.
// Emits "update:progress" events with JSON payload {phase, percent, message}.
// On success: relaunches the app (Linux) or launches the NSIS installer and quits (Windows).
func (a *App) DownloadAndInstall(latestVersion string) {
	go func() {
		emit := func(phase string, percent int, message string) {
			data, _ := json.Marshal(map[string]interface{}{
				"phase": phase, "percent": percent, "message": message,
			})
			runtime.EventsEmit(a.ctx, "update:progress", string(data))
		}

		rel, err := fetchLatestRelease()
		if err != nil {
			emit("error", 0, "Failed to fetch release info: "+err.Error())
			return
		}

		assetURL := findAssetURL(rel)
		if assetURL == "" {
			emit("error", 0, "No update asset found for this platform")
			return
		}

		tmpPath, pathErr := updateTempPath()
		if pathErr != nil {
			emit("error", 0, "Cannot determine download path: "+pathErr.Error())
			return
		}

		emit("download", 0, "Starting download…")
		if err := downloadFile(assetURL, tmpPath, func(pct int) {
			emit("download", pct, fmt.Sprintf("Downloading… %d%%", pct))
		}); err != nil {
			emit("error", 0, "Download failed: "+err.Error())
			return
		}

		emit("installing", 100, "Installing update…")
		if isWindowsOS() {
			if err := installWindows(tmpPath); err != nil {
				emit("error", 0, "Failed to launch installer: "+err.Error())
				return
			}
			emit("done", 100, "Installer launched. The app will now close.")
			runtime.Quit(a.ctx)
		} else {
			if err := installLinux(tmpPath); err != nil {
				emit("error", 0, "Failed to install update: "+err.Error())
				return
			}
			if err := restartLinux(); err != nil {
				emit("error", 0, "Update installed but failed to restart: "+err.Error())
				return
			}
			emit("done", 100, "Update installed. Restarting…")
			stopBackend(a.backendCmd)
			runtime.Quit(a.ctx)
		}
	}()
}

// SelectDirectory opens a native directory picker dialog.
func (a *App) SelectDirectory() string {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Music Directory",
	})
	if err != nil {
		return ""
	}
	return dir
}
