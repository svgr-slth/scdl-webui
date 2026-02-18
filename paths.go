package main

import (
	"os"
	"path/filepath"
	"runtime"
)

const appName = "scdl-web"

func installDir() string {
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", appName)
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), appName)
	default: // linux
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", appName)
	}
}

func dataDir() string {
	return filepath.Join(installDir(), "data")
}

func backendDir() string {
	return filepath.Join(installDir(), "backend")
}

func venvDir() string {
	return filepath.Join(installDir(), "venv")
}

func envFile() string {
	return filepath.Join(installDir(), ".env")
}
