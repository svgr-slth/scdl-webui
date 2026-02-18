//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func installService() {
	printStep("Configuring auto-start...")

	// Use Windows Task Scheduler for reliable auto-start
	bp := binPath()
	taskName := "scdl-web"

	// Create a scheduled task that runs at logon
	cmd := exec.Command("schtasks", "/create",
		"/tn", taskName,
		"/tr", fmt.Sprintf(`"%s" start`, bp),
		"/sc", "onlogon",
		"/rl", "highest",
		"/f", // Force overwrite if exists
	)
	if err := cmd.Run(); err != nil {
		printWarn("Could not create scheduled task: %v", err)
		printInfo("You can start scdl-web manually with: scdl-web start")
		return
	}

	printOK("Auto-start configured via Task Scheduler")
}

func removeService() {
	taskName := "scdl-web"

	cmd := exec.Command("schtasks", "/delete", "/tn", taskName, "/f")
	cmd.Run() // Ignore errors if task doesn't exist

	// Also remove from startup folder if present
	startupDir := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
	os.Remove(filepath.Join(startupDir, "scdl-web.lnk"))

	printOK("Auto-start removed")
}
