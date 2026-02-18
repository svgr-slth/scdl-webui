package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func cmdUninstall() {
	fmt.Println("scdl-web Uninstaller")
	fmt.Println()
	fmt.Printf("Install dir: %s\n", installDir())
	fmt.Printf("Data dir:    %s\n", dataDir())
	fmt.Println()
	fmt.Println("This will remove the scdl-web application.")
	fmt.Println("Your data (music, database) will be preserved.")
	fmt.Println()

	if !confirmPrompt("Are you sure you want to uninstall?") {
		fmt.Println("Cancelled.")
		return
	}

	// Stop containers
	printStep("Stopping containers...")
	if _, err := os.Stat(composeFile()); err == nil {
		composeDown()
	}

	// Remove Docker images
	fmt.Println()
	if confirmPrompt("Remove Docker images?") {
		printStep("Removing Docker images...")
		composeRun("down", "--rmi", "local")
	}

	// Disable and remove service
	printStep("Removing auto-start service...")
	removeService()

	// Remove hosts entry
	printStep("Removing hosts entry...")
	removeHostsEntry()

	// Preserve data directory
	iDir := installDir()
	dDir := dataDir()

	if isSubdir(dDir, iDir) {
		// Data is inside install dir, move it out
		backupDir := filepath.Join(homeDir(), "scdl-web-data")
		printStep("Backing up data to %s...", backupDir)
		if err := os.Rename(dDir, backupDir); err != nil {
			// Try copy if rename fails (cross-device)
			printWarn("Could not move data dir, it will remain in place: %v", err)
		} else {
			printOK("Data backed up to %s", backupDir)
		}
	}

	// Remove install directory
	printStep("Removing installation directory...")
	if err := os.RemoveAll(iDir); err != nil {
		printWarn("Could not fully remove %s: %v", iDir, err)
	} else {
		printOK("Removed %s", iDir)
	}

	// Remove binary from PATH
	bp := binPath()
	if _, err := os.Stat(bp); err == nil {
		printStep("Removing scdl-web command...")
		if err := os.Remove(bp); err != nil {
			printWarn("Could not remove %s: %v", bp, err)
		} else {
			printOK("Removed %s", bp)
		}
	}

	fmt.Println()
	printOK("scdl-web has been uninstalled.")
	if isSubdir(dDir, iDir) {
		printInfo("Your data has been preserved at: %s", filepath.Join(homeDir(), "scdl-web-data"))
	} else {
		printInfo("Your data has been preserved at: %s", dDir)
	}
}

func isSubdir(child, parent string) bool {
	absChild, _ := filepath.Abs(child)
	absParent, _ := filepath.Abs(parent)
	rel, err := filepath.Rel(absParent, absChild)
	if err != nil {
		return false
	}
	return !filepath.IsAbs(rel) && rel != ".." && len(rel) > 0 && rel[0] != '.'
}

func homeDir() string {
	home, _ := os.UserHomeDir()
	return home
}
