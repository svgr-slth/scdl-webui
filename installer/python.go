package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

// findPython returns the path to a Python 3.10+ interpreter, or empty string.
func findPython() string {
	for _, name := range []string{"python3", "python"} {
		path, err := exec.LookPath(name)
		if err != nil {
			continue
		}
		out, err := exec.Command(path, "--version").Output()
		if err != nil {
			continue
		}
		// Parse "Python 3.12.1"
		parts := strings.Fields(strings.TrimSpace(string(out)))
		if len(parts) < 2 {
			continue
		}
		ver := strings.Split(parts[1], ".")
		if len(ver) < 2 {
			continue
		}
		major, _ := strconv.Atoi(ver[0])
		minor, _ := strconv.Atoi(ver[1])
		if major == 3 && minor >= 10 {
			return path
		}
	}
	return ""
}

func checkPython() bool {
	return findPython() != ""
}

func checkFFmpeg() bool {
	_, err := exec.LookPath("ffmpeg")
	return err == nil
}

func installPython() error {
	switch runtime.GOOS {
	case "linux":
		return installWithPackageManager(
			[]string{"python3", "python3-venv", "python3-pip"}, // debian
			[]string{"python3", "python3-pip"},                  // rhel
			[]string{"python"},                                  // arch
		)
	case "darwin":
		if _, err := exec.LookPath("brew"); err == nil {
			printStep("Installing Python via Homebrew...")
			cmd := exec.Command("brew", "install", "python@3.12")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			return cmd.Run()
		}
		return fmt.Errorf("Python 3.10+ is required.\nInstall Homebrew (https://brew.sh) then run: brew install python@3.12")
	case "windows":
		if _, err := exec.LookPath("winget"); err == nil {
			printStep("Installing Python via winget...")
			cmd := exec.Command("winget", "install", "-e", "--id", "Python.Python.3.12",
				"--accept-source-agreements", "--accept-package-agreements")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			return cmd.Run()
		}
		return fmt.Errorf("Python 3.10+ is required.\nDownload from: https://www.python.org/downloads/")
	}
	return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
}

func installFFmpeg() error {
	switch runtime.GOOS {
	case "linux":
		return installWithPackageManager(
			[]string{"ffmpeg"}, // debian
			[]string{"ffmpeg"}, // rhel
			[]string{"ffmpeg"}, // arch
		)
	case "darwin":
		if _, err := exec.LookPath("brew"); err == nil {
			printStep("Installing FFmpeg via Homebrew...")
			cmd := exec.Command("brew", "install", "ffmpeg")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			return cmd.Run()
		}
		return fmt.Errorf("FFmpeg is required.\nInstall via: brew install ffmpeg")
	case "windows":
		if _, err := exec.LookPath("winget"); err == nil {
			printStep("Installing FFmpeg via winget...")
			cmd := exec.Command("winget", "install", "-e", "--id", "Gyan.FFmpeg",
				"--accept-source-agreements", "--accept-package-agreements")
			cmd.Stdout = os.Stdout
			cmd.Stderr = os.Stderr
			return cmd.Run()
		}
		return fmt.Errorf("FFmpeg is required.\nDownload from: https://ffmpeg.org/download.html")
	}
	return fmt.Errorf("unsupported OS: %s", runtime.GOOS)
}

// installWithPackageManager tries apt, then dnf, then pacman.
func installWithPackageManager(debianPkgs, rhelPkgs, archPkgs []string) error {
	if os.Getuid() != 0 {
		return fmt.Errorf("package installation requires root.\nRun with sudo or install manually")
	}

	if _, err := exec.LookPath("apt-get"); err == nil {
		args := append([]string{"install", "-y"}, debianPkgs...)
		exec.Command("apt-get", "update").Run()
		cmd := exec.Command("apt-get", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}
	if _, err := exec.LookPath("dnf"); err == nil {
		args := append([]string{"install", "-y"}, rhelPkgs...)
		cmd := exec.Command("dnf", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}
	if _, err := exec.LookPath("pacman"); err == nil {
		args := append([]string{"-S", "--noconfirm"}, archPkgs...)
		cmd := exec.Command("pacman", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		return cmd.Run()
	}

	return fmt.Errorf("no supported package manager found (apt, dnf, pacman)")
}

func createVenv() error {
	py := findPython()
	if py == "" {
		return fmt.Errorf("python3 not found")
	}

	venv := venvDir()
	if _, err := os.Stat(filepath.Join(venv, "bin")); err == nil {
		printInfo("Python venv already exists")
		return nil
	}
	if runtime.GOOS == "windows" {
		if _, err := os.Stat(filepath.Join(venv, "Scripts")); err == nil {
			printInfo("Python venv already exists")
			return nil
		}
	}

	printStep("Creating Python virtual environment...")
	cmd := exec.Command(py, "-m", "venv", venv)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create venv: %w", err)
	}

	printOK("Python venv created")
	return nil
}

func pipInstall() error {
	printStep("Installing Python dependencies (this may take a minute)...")

	pip := venvPip()
	reqFile := filepath.Join(backendDir(), "requirements.txt")

	cmd := exec.Command(pip, "install", "-r", reqFile)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pip install failed: %w", err)
	}

	printOK("Python dependencies installed")
	return nil
}

// startBackend launches uvicorn as a subprocess and returns the Cmd.
func startBackend(envVars []string) (*exec.Cmd, error) {
	uvicorn := venvBin("uvicorn")

	cmd := exec.Command(uvicorn,
		"app.main:app",
		"--host", "127.0.0.1",
		"--port", "8000",
	)
	cmd.Dir = backendDir()
	cmd.Env = append(os.Environ(), envVars...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start backend: %w", err)
	}

	return cmd, nil
}

// stopBackend sends a termination signal to the backend process.
func stopBackend(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	if runtime.GOOS == "windows" {
		cmd.Process.Kill()
	} else {
		cmd.Process.Signal(syscall.SIGTERM)
	}
	cmd.Wait()
}

// venvBin returns the path to a binary inside the venv.
func venvBin(name string) string {
	if runtime.GOOS == "windows" {
		return filepath.Join(venvDir(), "Scripts", name+".exe")
	}
	return filepath.Join(venvDir(), "bin", name)
}

// venvPip returns the path to the pip binary inside the venv.
func venvPip() string {
	return venvBin("pip")
}

// readEnvFile reads a simple KEY=VALUE .env file and returns the entries.
func readEnvFile(path string) []string {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var envs []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.Contains(line, "=") {
			envs = append(envs, line)
		}
	}
	return envs
}
