package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

func cmdStart() {
	ensureInstalled()

	// Check if already running
	if pid, err := readPidFile(); err == nil && isProcessRunning(pid) {
		printInfo("scdl-web is already running (PID %d)", pid)
		printInfo("Web UI: %s", appURL)
		return
	}

	printStep("Starting scdl-web...")
	writePidFile()
	defer removePidFile()

	// Start the server (blocks until signal)
	startServer()
}

func cmdStop() {
	pid, err := readPidFile()
	if err != nil {
		printInfo("scdl-web is not running (no PID file)")
		return
	}

	if !isProcessRunning(pid) {
		printInfo("scdl-web is not running (stale PID file)")
		removePidFile()
		return
	}

	printStep("Stopping scdl-web (PID %d)...", pid)

	process, err := os.FindProcess(pid)
	if err != nil {
		fatal("Could not find process: %v", err)
	}

	if runtime.GOOS == "windows" {
		process.Kill()
	} else {
		process.Signal(os.Interrupt)
	}

	// Wait for process to exit
	for i := 0; i < 30; i++ {
		if !isProcessRunning(pid) {
			removePidFile()
			printOK("scdl-web stopped")
			return
		}
		time.Sleep(500 * time.Millisecond)
	}

	process.Kill()
	removePidFile()
	printOK("scdl-web stopped (forced)")
}

func cmdRestart() {
	cmdStop()
	time.Sleep(1 * time.Second)
	cmdStart()
}

func cmdStatus() {
	ensureInstalled()

	fmt.Printf("scdl-web v%s\n", version)
	fmt.Printf("Install dir: %s\n", installDir())
	fmt.Printf("Data dir:    %s\n", dataDir())
	fmt.Println()

	// Process status
	pid, err := readPidFile()
	if err == nil && isProcessRunning(pid) {
		fmt.Printf("%sProcess: running (PID %d)%s\n", colorGreen, pid, colorReset)
	} else {
		fmt.Printf("%sProcess: stopped%s\n", colorRed, colorReset)
	}

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
		p := filepath.Join(dataDir(), sub)
		size := dirSize(p)
		fmt.Printf("  %-10s %s\n", sub+"/", formatBytes(size))
	}

	// Show configured music path
	envVars := readEnvFile(envFile())
	for _, env := range envVars {
		if strings.HasPrefix(env, "MUSIC_ROOT=") {
			fmt.Printf("\nMusic directory: %s\n", strings.TrimPrefix(env, "MUSIC_ROOT="))
		}
	}
}

func cmdLogs(args []string) {
	ensureInstalled()

	logFile := filepath.Join(installDir(), "scdl-web.log")
	if _, err := os.Stat(logFile); os.IsNotExist(err) {
		printInfo("No log file found at %s", logFile)
		printInfo("Logs are shown on stdout when running: scdl-web start")
		return
	}

	tail := "50"
	for i, arg := range args {
		switch arg {
		case "--tail", "-n":
			if i+1 < len(args) {
				tail = args[i+1]
			}
		}
	}

	cmd := exec.Command("tail", "-n", tail, logFile)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Run()
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
	if _, err := os.Stat(backendDir()); os.IsNotExist(err) {
		fatal("scdl-web is not installed. Run: scdl-web install")
	}
}

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
			size += dirSize(filepath.Join(path, entry.Name()))
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

func confirmPrompt(msg string) bool {
	fmt.Printf("%s [y/N] ", msg)
	var response string
	fmt.Scanln(&response)
	response = strings.TrimSpace(strings.ToLower(response))
	return response == "y" || response == "yes"
}
