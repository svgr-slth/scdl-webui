package main

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct manages the application lifecycle.
type App struct {
	ctx        context.Context
	backendCmd *exec.Cmd
}

// NewApp creates a new App instance.
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. It sets up the backend.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// First-run setup: extract backend, create venv, install deps
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
