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

	// Stop running process
	printStep("Stopping scdl-web...")
	if pid, err := readPidFile(); err == nil && isProcessRunning(pid) {
		process, _ := os.FindProcess(pid)
		if process != nil {
			process.Signal(os.Interrupt)
		}
	}
	removePidFile()

	// Remove service
	printStep("Removing auto-start service...")
	removeService()

	// Remove hosts entry
	printStep("Removing hosts entry...")
	removeHostsEntry()

	// Preserve data directory
	iDir := installDir()
	dDir := dataDir()

	if isSubdir(dDir, iDir) {
		backupDir := filepath.Join(homeDir(), "scdl-web-data")
		printStep("Backing up data to %s...", backupDir)
		if err := os.Rename(dDir, backupDir); err != nil {
			printWarn("Could not move data dir, it will remain in place: %v", err)
		} else {
			printOK("Data backed up to %s", backupDir)
		}
	}

	// Remove install directory (includes venv, backend code)
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
