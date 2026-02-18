package main

import (
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// isSetupComplete checks if the venv has been created.
// Backend Python files are always re-extracted by startup() to pick up upgrades.
func isSetupComplete() bool {
	// Check for venv Scripts (Windows) or bin (Unix)
	if _, err := os.Stat(filepath.Join(venvDir(), "Scripts")); err == nil {
		return true
	}
	if _, err := os.Stat(filepath.Join(venvDir(), "bin")); err == nil {
		return true
	}
	return false
}

// runFirstTimeSetup creates the venv, installs deps, and creates config.
// Backend files are always extracted by startup() before this is called.
func runFirstTimeSetup() error {
	log.Println("Running first-time setup...")

	if err := createVenv(); err != nil {
		return fmt.Errorf("failed to create virtual environment: %w", err)
	}

	if err := pipInstall(); err != nil {
		return fmt.Errorf("failed to install Python dependencies: %w", err)
	}

	createEnvFile()
	createDataDirs()

	log.Println("First-time setup complete")
	return nil
}

// extractBackendFiles extracts the embedded backend files to the install directory.
func extractBackendFiles() error {
	log.Printf("Extracting backend to %s...", installDir())

	err := fs.WalkDir(backendFS, "bundle/backend", func(path string, d fs.DirEntry, err error) error {
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

		srcFile, err := backendFS.Open(path)
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
		return err
	}

	// Also extract .env.example
	if data, err := fs.ReadFile(backendFS, "bundle/.env.example"); err == nil {
		os.WriteFile(filepath.Join(installDir(), ".env.example"), data, 0644)
	}

	log.Println("Backend files extracted")
	return nil
}

// createEnvFile creates the .env configuration file with host paths.
func createEnvFile() {
	if _, err := os.Stat(envFile()); err == nil {
		log.Println(".env file already exists, preserving")
		return
	}

	data, err := fs.ReadFile(backendFS, "bundle/.env.example")
	if err != nil {
		log.Printf("Warning: could not read .env.example: %v", err)
		return
	}

	content := string(data)
	// SQLAlchemy database URLs require forward slashes, even on Windows
	dbPath := filepath.ToSlash(filepath.Join(dataDir(), "db", "scdl-web.db"))
	content = strings.ReplaceAll(content, "sqlite+aiosqlite:////data/db/scdl-web.db",
		fmt.Sprintf("sqlite+aiosqlite:///%s", dbPath))
	content = strings.ReplaceAll(content, "/data/music", filepath.Join(dataDir(), "music"))
	content = strings.ReplaceAll(content, "/data/archives", filepath.Join(dataDir(), "archives"))

	if err := os.WriteFile(envFile(), []byte(content), 0644); err != nil {
		log.Printf("Warning: could not create .env file: %v", err)
		return
	}

	log.Printf("Created .env with data dir: %s", dataDir())
}

// createDataDirs creates the data directories (db, music, archives).
func createDataDirs() {
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
			log.Printf("Warning: cannot create directory %s: %v", dir, err)
		}
	}

	log.Println("Data directories created")
}
