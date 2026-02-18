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

func checkDocker() bool {
	cmd := exec.Command("docker", "--version")
	if err := cmd.Run(); err != nil {
		return false
	}
	return true
}

func checkDockerCompose() bool {
	cmd := exec.Command("docker", "compose", "version")
	if err := cmd.Run(); err != nil {
		return false
	}
	return true
}

func installDocker() error {
	switch runtime.GOOS {
	case "linux":
		return installDockerLinux()
	case "darwin":
		return installDockerDarwin()
	case "windows":
		return installDockerWindows()
	default:
		return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
	}
}

func installDockerLinux() error {
	printStep("Installing Docker via official script...")

	if os.Getuid() != 0 {
		return fmt.Errorf("Docker installation requires root privileges.\nPlease run: sudo %s install", os.Args[0])
	}

	// Download and run the official Docker install script
	cmd := exec.Command("sh", "-c", "curl -fsSL https://get.docker.com | sh")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to install Docker: %w", err)
	}

	// Enable and start Docker service
	exec.Command("systemctl", "enable", "docker").Run()
	exec.Command("systemctl", "start", "docker").Run()

	// Add the invoking user to the docker group
	sudoUser := os.Getenv("SUDO_USER")
	if sudoUser != "" {
		cmd = exec.Command("usermod", "-aG", "docker", sudoUser)
		if err := cmd.Run(); err != nil {
			printWarn("Could not add %s to docker group: %v", sudoUser, err)
		} else {
			printInfo("User %s added to docker group (re-login may be required)", sudoUser)
		}
	}

	return nil
}

func installDockerDarwin() error {
	// Try Homebrew first
	if _, err := exec.LookPath("brew"); err == nil {
		printStep("Installing Docker Desktop via Homebrew...")
		cmd := exec.Command("brew", "install", "--cask", "docker")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return fmt.Errorf("failed to install Docker Desktop: %w", err)
		}
		printInfo("Docker Desktop installed. Please launch it from Applications to complete setup.")
		printInfo("After Docker Desktop is running, re-run: scdl-web install")
		os.Exit(0)
	}

	return fmt.Errorf("Docker Desktop is required on macOS.\nPlease install it from: https://www.docker.com/products/docker-desktop/\nThen re-run: scdl-web install")
}

func installDockerWindows() error {
	// Try winget first
	if _, err := exec.LookPath("winget"); err == nil {
		printStep("Installing Docker Desktop via winget...")
		cmd := exec.Command("winget", "install", "-e", "--id", "Docker.DockerDesktop", "--accept-source-agreements", "--accept-package-agreements")
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			printWarn("winget installation failed, trying alternative...")
		} else {
			printInfo("Docker Desktop installed. Please restart your computer and re-run: scdl-web install")
			os.Exit(0)
		}
	}

	return fmt.Errorf("Docker Desktop is required on Windows.\nPlease install it from: https://www.docker.com/products/docker-desktop/\nThen re-run: scdl-web install")
}

// composeRun runs a docker compose command in the install directory
func composeRun(args ...string) error {
	fullArgs := append([]string{"compose", "-f", composeFile(), "--project-directory", installDir()}, args...)
	cmd := exec.Command("docker", fullArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Dir = installDir()
	return cmd.Run()
}

// composeRunSilent runs a docker compose command and captures output
func composeRunSilent(args ...string) (string, error) {
	fullArgs := append([]string{"compose", "-f", composeFile(), "--project-directory", installDir()}, args...)
	cmd := exec.Command("docker", fullArgs...)
	cmd.Dir = installDir()
	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func composeUp() error {
	return composeRun("up", "-d", "--remove-orphans")
}

func composeDown() error {
	return composeRun("down")
}

func composeBuild() error {
	return composeRun("build")
}

func composeLogs(follow bool, tail string) error {
	args := []string{"logs"}
	if follow {
		args = append(args, "-f")
	}
	if tail != "" {
		args = append(args, "--tail", tail)
	}
	return composeRun(args...)
}

func composePS() (string, error) {
	return composeRunSilent("ps", "--format", "table")
}

func waitForHealth(timeout time.Duration) bool {
	printStep("Waiting for application to become healthy...")
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 3 * time.Second}

	for time.Now().Before(deadline) {
		resp, err := client.Get(healthURL)
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return true
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(2 * time.Second)
	}
	return false
}
