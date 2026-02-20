package main

import (
	"fmt"
	"log"
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

func createVenv() error {
	py := findPython()
	if py == "" {
		return fmt.Errorf("python3 not found")
	}

	venv := venvDir()
	if runtime.GOOS == "windows" {
		if _, err := os.Stat(filepath.Join(venv, "Scripts")); err == nil {
			log.Println("Python venv already exists")
			return nil
		}
	} else {
		if _, err := os.Stat(filepath.Join(venv, "bin")); err == nil {
			log.Println("Python venv already exists")
			return nil
		}
	}

	log.Println("Creating Python virtual environment...")
	cmd := exec.Command(py, "-m", "venv", venv)
	hideWindow(cmd)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create venv: %w", err)
	}

	log.Println("Python venv created")
	return nil
}

// checkDeps verifies that all required Python packages are importable in the venv.
func checkDeps() bool {
	py := venvBin("python")
	cmd := exec.Command(py, "-c",
		"import fastapi; import uvicorn; import sqlalchemy; import aiosqlite; import alembic; import pydantic; import pydantic_settings; import scdl")
	hideWindow(cmd)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run() == nil
}

func pipInstall() error {
	log.Println("Installing Python dependencies...")

	pip := venvPip()
	reqFile := filepath.Join(backendDir(), "requirements.txt")

	cmd := exec.Command(pip, "install", "-r", reqFile)
	hideWindow(cmd)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("pip install failed: %w", err)
	}

	log.Println("Python dependencies installed")
	return nil
}

// startBackend launches uvicorn as a subprocess and returns the Cmd.
func startBackend(envVars []string) (*exec.Cmd, error) {
	uvicorn := venvBin("uvicorn")

	// Prepend venv Scripts/bin to PATH so subprocesses (scdl, ffmpeg…) are found.
	// We de-duplicate PATH to avoid glibc picking the old entry (first match wins).
	var venvScriptsDir string
	if runtime.GOOS == "windows" {
		venvScriptsDir = filepath.Join(venvDir(), "Scripts")
	} else {
		venvScriptsDir = filepath.Join(venvDir(), "bin")
	}
	newPath := venvScriptsDir + string(os.PathListSeparator) + os.Getenv("PATH")
	env := make([]string, 0, len(os.Environ())+len(envVars)+1)
	for _, e := range os.Environ() {
		key := strings.SplitN(e, "=", 2)[0]
		if !strings.EqualFold(key, "PATH") {
			env = append(env, e)
		}
	}
	env = append(env, "PATH="+newPath)
	env = append(env, envVars...)

	cmd := exec.Command(uvicorn,
		"app.main:app",
		"--host", "127.0.0.1",
		"--port", "8000",
	)
	hideWindow(cmd)
	cmd.Dir = backendDir()
	cmd.Env = env
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
