package main

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func cmdInstall(args []string) {
	fmt.Printf("\n%sscdl-web Installer v%s%s\n", colorBlue, version, colorReset)
	fmt.Println(strings.Repeat("=", 40))

	if runtime.GOOS == "linux" || runtime.GOOS == "darwin" {
		if isRoot() {
			printInfo("Install mode: system")
		} else {
			printInfo("Install mode: user")
		}
	}
	printInfo("Install dir:  %s", installDir())
	printInfo("Data dir:     %s", dataDir())
	fmt.Println()

	checkPrerequisites()
	ensurePython()
	ensureFFmpeg()
	extractFiles()
	setupVenv()
	createEnvFile()
	createDataDirs()
	setupHosts()
	installService()
	installBinary()
	printSummary()

	fmt.Println()
	printInfo("Start the application with: scdl-web start")
}

func checkPrerequisites() {
	printStep("Checking prerequisites...")

	if _, err := os.Stat("/.dockerenv"); err == nil {
		fatal("Running inside a Docker container is not supported.")
	}

	printOK("Prerequisites check passed")
}

func ensurePython() {
	printStep("Checking Python...")

	if checkPython() {
		py := findPython()
		out, _ := exec.Command(py, "--version").Output()
		printOK("Python found: %s", strings.TrimSpace(string(out)))
		return
	}

	printWarn("Python 3.10+ not found")
	if err := installPython(); err != nil {
		fatal("%v", err)
	}

	if !checkPython() {
		fatal("Python installation completed but python3 is not available.\nPlease restart your terminal and re-run: scdl-web install")
	}

	printOK("Python installed successfully")
}

func ensureFFmpeg() {
	printStep("Checking FFmpeg...")

	if checkFFmpeg() {
		printOK("FFmpeg found")
		return
	}

	printWarn("FFmpeg not found")
	if err := installFFmpeg(); err != nil {
		fatal("%v", err)
	}

	if !checkFFmpeg() {
		fatal("FFmpeg installation completed but ffmpeg is not available.\nPlease restart your terminal and re-run: scdl-web install")
	}

	printOK("FFmpeg installed successfully")
}

func extractFiles() {
	printStep("Extracting files to %s...", installDir())

	// Extract backend files from bundle
	err := fs.WalkDir(bundleFS, "bundle/backend", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		relPath := strings.TrimPrefix(path, "bundle/")
		if relPath == "" {
			return nil
		}

		destPath := filepath.Join(installDir(), relPath)

		if d.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}

		srcFile, err := bundleFS.Open(path)
		if err != nil {
			return fmt.Errorf("cannot read embedded file %s: %w", path, err)
		}
		defer srcFile.Close()

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return err
		}

		dstFile, err := os.Create(destPath)
		if err != nil {
			return fmt.Errorf("cannot create %s: %w", destPath, err)
		}
		defer dstFile.Close()

		if _, err := io.Copy(dstFile, srcFile); err != nil {
			return fmt.Errorf("cannot write %s: %w", destPath, err)
		}

		return nil
	})

	if err != nil {
		fatal("Failed to extract files: %v", err)
	}

	// Also extract .env.example
	if data, err := fs.ReadFile(bundleFS, "bundle/.env.example"); err == nil {
		os.WriteFile(filepath.Join(installDir(), ".env.example"), data, 0644)
	}

	printOK("Files extracted")
}

func setupVenv() {
	if err := createVenv(); err != nil {
		fatal("Failed to create virtual environment: %v", err)
	}

	if err := pipInstall(); err != nil {
		fatal("Failed to install dependencies: %v", err)
	}
}

func createEnvFile() {
	if _, err := os.Stat(envFile()); err == nil {
		printInfo(".env file already exists, preserving")
		return
	}

	data, err := fs.ReadFile(bundleFS, "bundle/.env.example")
	if err != nil {
		printWarn("Could not read .env.example: %v", err)
		return
	}

	// Replace Docker paths with host paths
	content := string(data)
	// SQLAlchemy database URLs require forward slashes, even on Windows
	dbPath := filepath.ToSlash(filepath.Join(dataDir(), "db", "scdl-web.db"))
	content = strings.ReplaceAll(content, "sqlite+aiosqlite:////data/db/scdl-web.db",
		fmt.Sprintf("sqlite+aiosqlite:///%s", dbPath))
	content = strings.ReplaceAll(content, "/data/music", filepath.Join(dataDir(), "music"))
	content = strings.ReplaceAll(content, "/data/archives", filepath.Join(dataDir(), "archives"))

	if err := os.WriteFile(envFile(), []byte(content), 0644); err != nil {
		printWarn("Could not create .env file: %v", err)
		return
	}

	printOK("Created .env with default paths")
	printInfo("Music will be downloaded to: %s", filepath.Join(dataDir(), "music"))
	printInfo("Edit %s to change the download location", envFile())
}

func createDataDirs() {
	// Read the env file to get configured paths
	envVars := readEnvFile(envFile())
	musicRoot := filepath.Join(dataDir(), "music")
	archivesRoot := filepath.Join(dataDir(), "archives")
	dbDir := filepath.Join(dataDir(), "db")

	for _, env := range envVars {
		if strings.HasPrefix(env, "MUSIC_ROOT=") {
			musicRoot = strings.TrimPrefix(env, "MUSIC_ROOT=")
		}
		if strings.HasPrefix(env, "ARCHIVES_ROOT=") {
			archivesRoot = strings.TrimPrefix(env, "ARCHIVES_ROOT=")
		}
	}

	for _, dir := range []string{dbDir, musicRoot, archivesRoot} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			fatal("Cannot create directory %s: %v", dir, err)
		}
	}

	printOK("Data directories created")
}

func setupHosts() {
	printStep("Configuring %s...", hostname)
	if err := addHostsEntry(); err != nil {
		printWarn("Could not configure %s: %v", hostname, err)
		printWarn("You can add it manually: echo '%s' >> %s", hostsEntry, hostsFilePath())
	}
}

func installBinary() {
	exe, err := os.Executable()
	if err != nil {
		printWarn("Could not determine executable path: %v", err)
		return
	}

	dest := binPath()

	absExe, _ := filepath.Abs(exe)
	absDest, _ := filepath.Abs(dest)
	if absExe == absDest {
		return
	}

	printStep("Installing scdl-web command to %s...", dest)

	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		printWarn("Could not create bin directory: %v", err)
		return
	}

	srcFile, err := os.Open(exe)
	if err != nil {
		printWarn("Could not read binary: %v", err)
		return
	}
	defer srcFile.Close()

	dstFile, err := os.Create(dest)
	if err != nil {
		printWarn("Could not install binary to %s: %v", dest, err)
		return
	}
	defer dstFile.Close()

	if _, err := io.Copy(dstFile, srcFile); err != nil {
		printWarn("Could not copy binary: %v", err)
		return
	}

	if runtime.GOOS != "windows" {
		os.Chmod(dest, 0755)
	}

	printOK("scdl-web command installed to %s", dest)

	pathEnv := os.Getenv("PATH")
	if !strings.Contains(pathEnv, filepath.Dir(dest)) {
		printWarn("%s is not in your PATH", filepath.Dir(dest))
		printInfo("Add to your shell profile: export PATH=\"%s:$PATH\"", filepath.Dir(dest))
	}
}

func printSummary() {
	fmt.Println()
	fmt.Println(strings.Repeat("=", 48))
	fmt.Printf("%s  scdl-web v%s installed successfully!%s\n", colorGreen, version, colorReset)
	fmt.Println(strings.Repeat("=", 48))
	fmt.Println()
	fmt.Printf("  Install dir:  %s\n", installDir())
	fmt.Printf("  Data dir:     %s\n", dataDir())
	fmt.Printf("  Web UI:       %s\n", appURL)
	fmt.Println()
	fmt.Println("  Commands:")
	fmt.Println("    scdl-web start      Start the application")
	fmt.Println("    scdl-web stop       Stop the application")
	fmt.Println("    scdl-web status     Show status")
	fmt.Println("    scdl-web logs       View backend logs")
	fmt.Println("    scdl-web open       Open in browser")
	fmt.Println("    scdl-web uninstall  Remove application")
	fmt.Println()
	fmt.Println(strings.Repeat("=", 48))
}
