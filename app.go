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
func (a *App) WatchSync(sourceId int) {
	ctx, cancel := context.WithCancel(context.Background())
	a.syncWatchCancels.Store(sourceId, cancel)
	go func() {
		defer cancel()
		defer a.syncWatchCancels.Delete(sourceId)
		eventName := fmt.Sprintf("sync:%d", sourceId)
		conn, _, err := gorilla.DefaultDialer.DialContext(ctx,
			fmt.Sprintf("ws://127.0.0.1:8000/ws/sync/%d", sourceId), nil)
		if err != nil {
			runtime.EventsEmit(a.ctx, eventName,
				`{"type":"status","status":"failed","error":"backend unavailable"}`)
			return
		}
		defer conn.Close()
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
}

// StopWatchSync cancels the goroutine watching the given source (called on unmount).
func (a *App) StopWatchSync(sourceId int) {
	if v, ok := a.syncWatchCancels.Load(sourceId); ok {
		v.(context.CancelFunc)()
	}
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
