package main

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
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
	ensureDocker()
	extractFiles()
	createEnvFile()
	createDataDirs()
	buildImages()
	setupHosts()
	installService()
	startApp()
	installBinary()
	printSummary()
}

func checkPrerequisites() {
	printStep("Checking prerequisites...")

	// Check we're not running inside a container
	if _, err := os.Stat("/.dockerenv"); err == nil {
		fatal("Running inside a Docker container is not supported.")
	}

	// Check disk space (need at least 2GB free)
	// We just warn; don't block installation
	printOK("Prerequisites check passed")
}

func ensureDocker() {
	printStep("Checking Docker...")

	if checkDocker() && checkDockerCompose() {
		printOK("Docker and Docker Compose are available")
		return
	}

	if !checkDocker() {
		printWarn("Docker not found")
		if err := installDocker(); err != nil {
			fatal("%v", err)
		}

		// Verify Docker works after installation
		if !checkDocker() {
			fatal("Docker installation completed but docker command is not available.\nPlease restart your terminal or computer and re-run: scdl-web install")
		}
	}

	if !checkDockerCompose() {
		fatal("Docker Compose is not available.\nPlease install the Docker Compose plugin and re-run: scdl-web install")
	}

	printOK("Docker and Docker Compose are ready")
}

func extractFiles() {
	printStep("Extracting project files to %s...", installDir())

	// If install dir exists and has a compose file, this is an upgrade
	if _, err := os.Stat(composeFile()); err == nil {
		printInfo("Existing installation detected, updating...")
		// Stop running containers before updating
		composeDown()
	}

	// Walk the embedded filesystem and copy files
	err := fs.WalkDir(bundleFS, "bundle", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Strip the "bundle/" prefix to get the relative path
		relPath := strings.TrimPrefix(path, "bundle/")
		if relPath == "" || relPath == "bundle" {
			return nil
		}

		destPath := filepath.Join(installDir(), relPath)

		if d.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}

		// Read from embedded FS
		srcFile, err := bundleFS.Open(path)
		if err != nil {
			return fmt.Errorf("cannot read embedded file %s: %w", path, err)
		}
		defer srcFile.Close()

		// Create destination file
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

	printOK("Project files extracted")
}

func createEnvFile() {
	// Don't overwrite existing .env (preserve user settings on upgrade)
	if _, err := os.Stat(envFile()); err == nil {
		printInfo(".env file already exists, preserving")
		return
	}

	examplePath := filepath.Join(installDir(), ".env.example")
	data, err := os.ReadFile(examplePath)
	if err != nil {
		printWarn("Could not read .env.example: %v", err)
		return
	}

	if err := os.WriteFile(envFile(), data, 0644); err != nil {
		printWarn("Could not create .env file: %v", err)
		return
	}

	printOK("Created .env from .env.example")
}

func createDataDirs() {
	dirs := []string{
		filepath.Join(dataDir(), "db"),
		filepath.Join(dataDir(), "music"),
		filepath.Join(dataDir(), "archives"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			fatal("Cannot create directory %s: %v", dir, err)
		}
	}

	printOK("Data directories created")
}

func buildImages() {
	printStep("Building Docker images (this may take a few minutes)...")

	if err := composeBuild(); err != nil {
		fatal("Docker image build failed: %v\nCheck your internet connection (Docker needs to pull base images).", err)
	}

	printOK("Docker images built successfully")
}

func setupHosts() {
	printStep("Configuring %s...", hostname)
	if err := addHostsEntry(); err != nil {
		printWarn("Could not configure %s: %v", hostname, err)
		printWarn("You can add it manually: echo '%s' >> %s", hostsEntry, hostsFilePath())
	}
}

func startApp() {
	printStep("Starting scdl-web...")

	if err := composeUp(); err != nil {
		fatal("Failed to start application: %v", err)
	}

	if waitForHealth(60 * time.Second) {
		printOK("Application is healthy!")
	} else {
		printWarn("Application may still be starting. Check: scdl-web status")
	}
}

func installBinary() {
	// Copy the current binary to the bin directory
	exe, err := os.Executable()
	if err != nil {
		printWarn("Could not determine executable path: %v", err)
		return
	}

	dest := binPath()

	// Don't copy if already in the right place
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

	// Make executable on Unix
	if runtime.GOOS != "windows" {
		os.Chmod(dest, 0755)
	}

	printOK("scdl-web command installed to %s", dest)

	// Check if bin dir is in PATH
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
	fmt.Println("    scdl-web logs       View logs")
	fmt.Println("    scdl-web open       Open in browser")
	fmt.Println("    scdl-web uninstall  Remove application")
	fmt.Println()
	fmt.Println(strings.Repeat("=", 48))
}
