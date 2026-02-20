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

// appImagePath returns the path to the actual .AppImage file on Linux.
// Inside an AppImage, os.Executable() returns the FUSE-mounted binary path
// (e.g. /tmp/.mount_XXX/usr/bin/scdl-web), not the .AppImage file itself.
// The AppImage runtime sets $APPIMAGE to the real path.
func appImagePath() (string, error) {
	if p := os.Getenv("APPIMAGE"); p != "" {
		return p, nil
	}
	// Fallback for non-AppImage Linux builds
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(exe)
}

// updateTempPath returns a suitable path to download the update file to.
// Always uses the OS temp dir so the download succeeds regardless of
// the target directory's permissions.
func updateTempPath() (string, error) {
	if goruntime.GOOS == "windows" {
		return filepath.Join(os.TempDir(), "scdl-web-update-installer.exe"), nil
	}
	return filepath.Join(os.TempDir(), "scdl-web.update.AppImage"), nil
}

// installWindows launches the NSIS installer with UAC elevation.
// The installer UI is shown so the user sees version info and can choose to
// launch the app on the finish page. The NSIS script kills the running
// scdl-web process tree before copying files, so file-lock issues are avoided.
func installWindows(installerPath string) error {
	cmd := exec.Command("powershell", "-WindowStyle", "Hidden", "-Command",
		fmt.Sprintf(`Start-Process -FilePath '%s' -Verb RunAs`,
			installerPath))
	return cmd.Run()
}

// copyAndReplace copies src to dst atomically via a temp file + rename.
// Returns an error if the target directory is not writable.
func copyAndReplace(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	tmp := dst + ".tmp"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}

	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}

	return os.Rename(tmp, dst)
}

// installLinux replaces the running AppImage with the downloaded update.
// Attempts three strategies in order:
//  1. Atomic rename (fast, works if same filesystem + user has write perms)
//  2. File copy without elevation (works across filesystems if user has write perms)
//  3. Elevated copy via pkexec (Polkit graphical password prompt)
func installLinux(downloadedPath string) error {
	target, err := appImagePath()
	if err != nil {
		return fmt.Errorf("cannot determine AppImage path: %w", err)
	}

	// Try 1: atomic rename (same filesystem + write perms)
	if err := os.Rename(downloadedPath, target); err == nil {
		return os.Chmod(target, 0755)
	}

	// Try 2: copy without elevation (different filesystem, user has write perms)
	if err := copyAndReplace(downloadedPath, target); err == nil {
		os.Remove(downloadedPath)
		return os.Chmod(target, 0755)
	}

	// Try 3: elevated copy via pkexec (polkit graphical password prompt)
	cmd := exec.Command("pkexec", "sh", "-c",
		fmt.Sprintf("cp '%s' '%s' && chmod 755 '%s'",
			downloadedPath, target, target))
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to install update (elevated privileges required): %w", err)
	}
	os.Remove(downloadedPath)
	return nil
}

// restartLinux spawns a new instance of the (now-updated) AppImage and returns.
// The caller should stop the backend and quit the Wails app after calling this.
func restartLinux() error {
	exe, err := appImagePath()
	if err != nil {
		return err
	}
	cmd := exec.Command(exe, os.Args[1:]...)
	return cmd.Start()
}
