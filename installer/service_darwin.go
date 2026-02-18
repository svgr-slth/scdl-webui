//go:build darwin

package main

import (
	"os"
	"path/filepath"
	"strings"
)

const launchdPlistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.scdl-web.app</string>
    <key>ProgramArguments</key>
    <array>
        <string>{{BIN_PATH}}</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>{{INSTALL_DIR}}</string>
    <key>StandardOutPath</key>
    <string>{{INSTALL_DIR}}/scdl-web.log</string>
    <key>StandardErrorPath</key>
    <string>{{INSTALL_DIR}}/scdl-web.err.log</string>
</dict>
</plist>
`

func installService() {
	printStep("Installing launchd service...")

	home, _ := os.UserHomeDir()
	agentsDir := filepath.Join(home, "Library", "LaunchAgents")
	if err := os.MkdirAll(agentsDir, 0755); err != nil {
		printWarn("Could not create LaunchAgents directory: %v", err)
		return
	}

	content := launchdPlistTemplate
	content = strings.ReplaceAll(content, "{{BIN_PATH}}", binPath())
	content = strings.ReplaceAll(content, "{{INSTALL_DIR}}", installDir())

	plistPath := filepath.Join(agentsDir, "com.scdl-web.app.plist")
	if err := os.WriteFile(plistPath, []byte(content), 0644); err != nil {
		printWarn("Could not install launchd service: %v", err)
		return
	}

	printOK("Launchd service installed (will auto-start on login)")
}

func removeService() {
	home, _ := os.UserHomeDir()
	plistPath := filepath.Join(home, "Library", "LaunchAgents", "com.scdl-web.app.plist")
	os.Remove(plistPath)
	printOK("Launchd service removed")
}
