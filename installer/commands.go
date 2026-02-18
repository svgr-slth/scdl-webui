package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

func cmdStart() {
	ensureInstalled()
	printStep("Starting scdl-web...")

	if err := composeUp(); err != nil {
		fatal("Failed to start: %v", err)
	}

	printOK("scdl-web started")
	printInfo("Web UI: %s", appURL)
}

func cmdStop() {
	ensureInstalled()
	printStep("Stopping scdl-web...")

	if err := composeDown(); err != nil {
		fatal("Failed to stop: %v", err)
	}

	printOK("scdl-web stopped")
}

func cmdRestart() {
	ensureInstalled()
	printStep("Restarting scdl-web...")

	composeDown()
	if err := composeUp(); err != nil {
		fatal("Failed to start: %v", err)
	}

	printOK("scdl-web restarted")
	printInfo("Web UI: %s", appURL)
}

func cmdStatus() {
	ensureInstalled()

	fmt.Printf("scdl-web v%s\n", version)
	fmt.Printf("Install dir: %s\n", installDir())
	fmt.Printf("Data dir:    %s\n", dataDir())
	fmt.Println()

	// Container status
	fmt.Println("Containers:")
	ps, err := composePS()
	if err != nil {
		printWarn("Could not get container status: %v", err)
	} else {
		fmt.Println(ps)
	}
	fmt.Println()

	// Health check
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(healthURL)
	if err == nil && resp.StatusCode == 200 {
		resp.Body.Close()
		fmt.Printf("%sHealth: OK (%s)%s\n", colorGreen, appURL, colorReset)
	} else {
		if resp != nil {
			resp.Body.Close()
		}
		fmt.Printf("%sHealth: UNREACHABLE (%s)%s\n", colorRed, appURL, colorReset)
	}

	// Data dir usage
	fmt.Println()
	fmt.Println("Data usage:")
	for _, sub := range []string{"db", "music", "archives"} {
		path := fmt.Sprintf("%s/%s", dataDir(), sub)
		size := dirSize(path)
		fmt.Printf("  %-10s %s\n", sub+"/", formatBytes(size))
	}
}

func cmdLogs(args []string) {
	ensureInstalled()

	follow := false
	tail := ""
	for i, arg := range args {
		switch arg {
		case "-f", "--follow":
			follow = true
		case "--tail", "-n":
			if i+1 < len(args) {
				tail = args[i+1]
			}
		}
	}

	if err := composeLogs(follow, tail); err != nil {
		fatal("Failed to get logs: %v", err)
	}
}

func cmdOpen() {
	url := appURL
	printInfo("Opening %s...", url)

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		printInfo("Open in your browser: %s", url)
		return
	}

	if err := cmd.Start(); err != nil {
		printInfo("Open in your browser: %s", url)
	}
}

func ensureInstalled() {
	if _, err := os.Stat(composeFile()); os.IsNotExist(err) {
		fatal("scdl-web is not installed. Run: scdl-web install")
	}
}

// dirSize calculates the total size of a directory
func dirSize(path string) int64 {
	var size int64
	entries, err := os.ReadDir(path)
	if err != nil {
		return 0
	}
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if entry.IsDir() {
			size += dirSize(fmt.Sprintf("%s/%s", path, entry.Name()))
		} else {
			size += info.Size()
		}
	}
	return size
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %s", float64(b)/float64(div), []string{"KB", "MB", "GB", "TB"}[exp])
}

func ensureDockerRunning() {
	if !checkDocker() {
		fatal("Docker is not available. Please start Docker and try again.")
	}

	// Check if Docker daemon is actually running
	cmd := exec.Command("docker", "info")
	if err := cmd.Run(); err != nil {
		if runtime.GOOS == "darwin" || runtime.GOOS == "windows" {
			fatal("Docker daemon is not running. Please start Docker Desktop and try again.")
		}
		fatal("Docker daemon is not running. Start it with: sudo systemctl start docker")
	}
}

func confirmPrompt(msg string) bool {
	fmt.Printf("%s [y/N] ", msg)
	var response string
	fmt.Scanln(&response)
	response = strings.TrimSpace(strings.ToLower(response))
	return response == "y" || response == "yes"
}
