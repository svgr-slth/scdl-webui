package main

import (
	"os"
	"path/filepath"
	"runtime"
)

const (
	appName   = "scdl-web"
	hostname  = "scdl.local"
	appURL    = "http://scdl.local"
	healthURL = "http://scdl.local/api/health"
)

func installDir() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), appName)
	default:
		if os.Getuid() == 0 {
			return filepath.Join("/opt", appName)
		}
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

func pidFile() string {
	return filepath.Join(installDir(), "scdl-web.pid")
}

func binDir() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "WindowsApps")
	default:
		if os.Getuid() == 0 {
			return "/usr/local/bin"
		}
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "bin")
	}
}

func binPath() string {
	name := appName
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Join(binDir(), name)
}

func isRoot() bool {
	if runtime.GOOS == "windows" {
		_, err := os.Open(`\\.\PHYSICALDRIVE0`)
		return err == nil
	}
	return os.Getuid() == 0
}
