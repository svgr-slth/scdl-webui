//go:build linux

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const systemServiceTemplate = `[Unit]
Description=scdl-web - SoundCloud Downloader Web UI
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory={{INSTALL_DIR}}
ExecStart=/usr/bin/docker compose -f {{INSTALL_DIR}}/docker-compose.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f {{INSTALL_DIR}}/docker-compose.yml down
ExecReload=/usr/bin/docker compose -f {{INSTALL_DIR}}/docker-compose.yml restart
TimeoutStartSec=120
TimeoutStopSec=60
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
`

const userServiceTemplate = `[Unit]
Description=scdl-web - SoundCloud Downloader Web UI
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory={{INSTALL_DIR}}
ExecStart=/usr/bin/docker compose -f {{INSTALL_DIR}}/docker-compose.yml up -d --remove-orphans
ExecStop=/usr/bin/docker compose -f {{INSTALL_DIR}}/docker-compose.yml down
ExecReload=/usr/bin/docker compose -f {{INSTALL_DIR}}/docker-compose.yml restart
TimeoutStartSec=120
TimeoutStopSec=60

[Install]
WantedBy=default.target
`

func installService() {
	// Check if systemd is available
	if _, err := exec.LookPath("systemctl"); err != nil {
		printWarn("systemd not found. Auto-start will not be configured.")
		printInfo("Start manually with: scdl-web start")
		return
	}

	printStep("Installing systemd service...")

	iDir := installDir()

	if isRoot() {
		// System-wide service
		content := strings.ReplaceAll(systemServiceTemplate, "{{INSTALL_DIR}}", iDir)
		servicePath := "/etc/systemd/system/scdl-web.service"

		if err := os.WriteFile(servicePath, []byte(content), 0644); err != nil {
			printWarn("Could not install system service: %v", err)
			return
		}

		exec.Command("systemctl", "daemon-reload").Run()
		exec.Command("systemctl", "enable", "scdl-web.service").Run()

		printOK("Systemd service installed and enabled")
	} else {
		// User service
		home, _ := os.UserHomeDir()
		serviceDir := filepath.Join(home, ".config", "systemd", "user")
		if err := os.MkdirAll(serviceDir, 0755); err != nil {
			printWarn("Could not create user service directory: %v", err)
			return
		}

		content := strings.ReplaceAll(userServiceTemplate, "{{INSTALL_DIR}}", iDir)
		servicePath := filepath.Join(serviceDir, "scdl-web.service")

		if err := os.WriteFile(servicePath, []byte(content), 0644); err != nil {
			printWarn("Could not install user service: %v", err)
			return
		}

		exec.Command("systemctl", "--user", "daemon-reload").Run()
		exec.Command("systemctl", "--user", "enable", "scdl-web.service").Run()

		// Enable lingering so service runs even when user is not logged in
		user := os.Getenv("USER")
		if user != "" {
			exec.Command("loginctl", "enable-linger", user).Run()
		}

		printOK("User systemd service installed and enabled")
	}
}

func removeService() {
	if _, err := exec.LookPath("systemctl"); err != nil {
		return
	}

	if isRoot() {
		exec.Command("systemctl", "stop", "scdl-web.service").Run()
		exec.Command("systemctl", "disable", "scdl-web.service").Run()
		os.Remove("/etc/systemd/system/scdl-web.service")
		exec.Command("systemctl", "daemon-reload").Run()
	} else {
		exec.Command("systemctl", "--user", "stop", "scdl-web.service").Run()
		exec.Command("systemctl", "--user", "disable", "scdl-web.service").Run()

		home, _ := os.UserHomeDir()
		servicePath := filepath.Join(home, ".config", "systemd", "user", "scdl-web.service")
		os.Remove(servicePath)
		exec.Command("systemctl", "--user", "daemon-reload").Run()
	}

	printOK("Systemd service removed")
}

func formatServicePath() string {
	if isRoot() {
		return "/etc/systemd/system/scdl-web.service"
	}
	home, _ := os.UserHomeDir()
	return fmt.Sprintf("%s/.config/systemd/user/scdl-web.service", home)
}
