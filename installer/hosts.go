package main

import (
	"fmt"
	"os"
	"runtime"
	"strings"
)

const hostsEntry = "127.0.0.1 scdl.local"

func hostsFilePath() string {
	if runtime.GOOS == "windows" {
		return `C:\Windows\System32\drivers\etc\hosts`
	}
	return "/etc/hosts"
}

func hasHostsEntry() bool {
	data, err := os.ReadFile(hostsFilePath())
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == hostsEntry {
			return true
		}
	}
	return false
}

func addHostsEntry() error {
	if hasHostsEntry() {
		printInfo("Hosts entry for %s already exists", hostname)
		return nil
	}

	path := hostsFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("cannot read %s: %w", path, err)
	}

	content := string(data)
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	content += hostsEntry + "\n"

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		if runtime.GOOS == "windows" {
			return fmt.Errorf("cannot write %s: run this command as Administrator", path)
		}
		return fmt.Errorf("cannot write %s: run with sudo", path)
	}

	printOK("Added %s to %s", hostname, path)
	return nil
}

func removeHostsEntry() error {
	path := hostsFilePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil // File doesn't exist, nothing to do
	}

	lines := strings.Split(string(data), "\n")
	var newLines []string
	found := false
	for _, line := range lines {
		if strings.TrimSpace(line) == hostsEntry {
			found = true
			continue
		}
		newLines = append(newLines, line)
	}

	if !found {
		return nil
	}

	if err := os.WriteFile(path, []byte(strings.Join(newLines, "\n")), 0644); err != nil {
		return fmt.Errorf("cannot write %s: %w", path, err)
	}

	printOK("Removed %s from %s", hostname, path)
	return nil
}
