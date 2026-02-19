package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strconv"
	"strings"
)

const githubRepo = "svgr-slth/scdl-webui"

// UpdateInfo is returned to the frontend when a newer version is available.
type UpdateInfo struct {
	Available bool   `json:"available"`
	Version   string `json:"version"`
	Notes     string `json:"notes"`
}

type githubRelease struct {
	TagName string `json:"tag_name"`
	Body    string `json:"body"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

// fetchLatestRelease queries the GitHub releases API (unauthenticated, 60 req/h limit).
func fetchLatestRelease() (*githubRelease, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", githubRepo)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "scdl-web-updater")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	return &rel, nil
}

// compareVersions compares two "vMAJOR.MINOR.PATCH" strings.
// Returns +1 if a > b, -1 if a < b, 0 if equal.
func compareVersions(a, b string) int {
	parse := func(v string) [3]int {
		v = strings.TrimPrefix(v, "v")
		parts := strings.SplitN(v, ".", 3)
		var nums [3]int
		for i, p := range parts {
			if i >= 3 {
				break
			}
			// strip pre-release suffix if any (e.g. "1-alpha" → 1)
			p = strings.SplitN(p, "-", 2)[0]
			nums[i], _ = strconv.Atoi(p)
		}
		return nums
	}
	av, bv := parse(a), parse(b)
	for i := range av {
		if av[i] > bv[i] {
			return 1
		}
		if av[i] < bv[i] {
			return -1
		}
	}
	return 0
}

// findAssetURL returns the browser download URL for the platform-appropriate release asset.
func findAssetURL(rel *githubRelease) string {
	switch goruntime.GOOS {
	case "windows":
		for _, a := range rel.Assets {
			if strings.HasSuffix(a.Name, "-installer.exe") {
				return a.BrowserDownloadURL
			}
		}
	case "linux":
		for _, a := range rel.Assets {
			if a.Name == LinuxAssetName {
				return a.BrowserDownloadURL
			}
		}
	}
	return ""
}

// downloadFile downloads url to dest, calling onProgress with [0,100] percent values.
func downloadFile(url, dest string, onProgress func(int)) error {
	resp, err := http.Get(url) //nolint:gosec // URL is from trusted GitHub API response
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()

	total := resp.ContentLength
	buf := make([]byte, 32*1024)
	var downloaded int64
	lastPct := -1

	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				return werr
			}
			downloaded += int64(n)
			if total > 0 {
				pct := int(downloaded * 100 / total)
				if pct != lastPct {
					onProgress(pct)
					lastPct = pct
				}
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// isWindowsOS reports whether the app is running on Windows.
// Used by app.go to avoid importing "runtime" a second time (it's aliased to Wails runtime there).
func isWindowsOS() bool {
	return goruntime.GOOS == "windows"
}

// updateTempPath returns a suitable path to download the update file to.
// On Windows this is the OS temp dir; on Linux it is the same directory as
// the running AppImage so that os.Rename() is atomic (same filesystem).
func updateTempPath() (string, error) {
	if goruntime.GOOS == "windows" {
		return filepath.Join(os.TempDir(), "scdl-web-update-installer.exe"), nil
	}
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(exe), ".scdl-web.update"), nil
}

// installWindows launches the NSIS installer silently (/S) and returns immediately.
// The caller should quit the app after calling this.
func installWindows(installerPath string) error {
	cmd := exec.Command(installerPath, "/S")
	return cmd.Start()
}

// installLinux atomically replaces the running AppImage with the downloaded file.
func installLinux(downloadedPath string) error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot determine executable path: %w", err)
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return fmt.Errorf("cannot resolve symlink: %w", err)
	}
	if err := os.Rename(downloadedPath, exe); err != nil {
		return fmt.Errorf("cannot replace AppImage (permission error?): %w", err)
	}
	return os.Chmod(exe, 0755)
}

// restartLinux spawns a new instance of the (now-updated) executable and returns.
// The caller should stop the backend and quit the Wails app after calling this.
func restartLinux() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return err
	}
	cmd := exec.Command(exe, os.Args[1:]...)
	return cmd.Start()
}
