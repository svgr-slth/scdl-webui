package main

import (
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"path"
	"strconv"
	"syscall"
	"time"
)

// startServer runs the HTTP server (frontend + reverse proxy) and the Python backend.
// It blocks until a termination signal is received.
func startServer() {
	envVars := readEnvFile(envFile())

	// Start Python backend
	printStep("Starting backend...")
	backendCmd, err := startBackend(envVars)
	if err != nil {
		fatal("Failed to start backend: %v", err)
	}

	// Wait for backend to be ready
	if !waitForBackend(30 * time.Second) {
		stopBackend(backendCmd)
		fatal("Backend failed to start within 30 seconds")
	}
	printOK("Backend is ready")

	// Setup HTTP server
	mux := http.NewServeMux()

	// Reverse proxy for API
	backendURL, _ := url.Parse("http://127.0.0.1:8000")
	proxy := httputil.NewSingleHostReverseProxy(backendURL)

	// WebSocket + API proxy
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		proxy.ServeHTTP(w, r)
	})
	mux.HandleFunc("/ws/", func(w http.ResponseWriter, r *http.Request) {
		proxyWebSocket(w, r)
	})

	// Frontend static files with SPA fallback
	frontendFS, err := fs.Sub(bundleFS, "bundle/frontend-dist")
	if err != nil {
		stopBackend(backendCmd)
		fatal("Failed to load frontend files: %v", err)
	}
	mux.Handle("/", spaHandler{fs: http.FS(frontendFS)})

	server := &http.Server{
		Addr:    ":80",
		Handler: mux,
	}

	// Handle shutdown signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		printInfo("Shutting down...")
		server.Close()
		stopBackend(backendCmd)
	}()

	// Also watch for backend process death
	go func() {
		backendCmd.Wait()
		printError("Backend process exited unexpectedly")
		server.Close()
	}()

	printOK("scdl-web running at %s", appURL)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		stopBackend(backendCmd)
		fatal("Server error: %v", err)
	}
}

// spaHandler serves static files with SPA fallback (index.html for unknown routes).
type spaHandler struct {
	fs http.FileSystem
}

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Clean the path
	p := path.Clean(r.URL.Path)
	if p == "/" {
		p = "/index.html"
	}

	// Try to open the file
	f, err := h.fs.Open(p)
	if err != nil {
		// File not found: serve index.html for SPA routing
		f, err = h.fs.Open("/index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
	}
	defer f.Close()

	// Check if it's a directory
	stat, err := f.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if stat.IsDir() {
		// Try index.html inside the directory
		indexPath := path.Join(p, "index.html")
		f2, err := h.fs.Open(indexPath)
		if err != nil {
			f3, _ := h.fs.Open("/index.html")
			if f3 != nil {
				defer f3.Close()
				stat3, _ := f3.Stat()
				http.ServeContent(w, r, "index.html", stat3.ModTime(), f3.(io.ReadSeeker))
			}
			return
		}
		defer f2.Close()
		f = f2
		stat, _ = f2.Stat()
	}

	// Set content type for known extensions
	http.ServeContent(w, r, stat.Name(), stat.ModTime(), f.(io.ReadSeeker))
}

// proxyWebSocket handles WebSocket upgrade and bidirectional proxying.
func proxyWebSocket(w http.ResponseWriter, r *http.Request) {
	targetURL := "ws://127.0.0.1:8000" + r.URL.Path
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	// Connect to backend WebSocket
	backendConn, err := net.DialTimeout("tcp", "127.0.0.1:8000", 5*time.Second)
	if err != nil {
		http.Error(w, "Backend unavailable", http.StatusBadGateway)
		return
	}

	// Hijack the client connection
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "WebSocket not supported", http.StatusInternalServerError)
		backendConn.Close()
		return
	}
	clientConn, _, err := hijacker.Hijack()
	if err != nil {
		http.Error(w, "Hijack failed", http.StatusInternalServerError)
		backendConn.Close()
		return
	}

	// Forward the original request to the backend
	err = r.Write(backendConn)
	if err != nil {
		clientConn.Close()
		backendConn.Close()
		return
	}

	// Bidirectional copy
	go func() {
		io.Copy(backendConn, clientConn)
		backendConn.Close()
	}()
	go func() {
		io.Copy(clientConn, backendConn)
		clientConn.Close()
	}()
}

// waitForBackend polls the backend health endpoint.
func waitForBackend(timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}

	for time.Now().Before(deadline) {
		resp, err := client.Get("http://127.0.0.1:8000/api/health")
		if err == nil && resp.StatusCode == 200 {
			resp.Body.Close()
			return true
		}
		if resp != nil {
			resp.Body.Close()
		}
		time.Sleep(500 * time.Millisecond)
	}
	return false
}

// writePidFile writes the current process PID to a file.
func writePidFile() error {
	return os.WriteFile(pidFile(), []byte(strconv.Itoa(os.Getpid())), 0644)
}

// readPidFile reads the PID from the PID file.
func readPidFile() (int, error) {
	data, err := os.ReadFile(pidFile())
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(string(data))
}

// removePidFile removes the PID file.
func removePidFile() {
	os.Remove(pidFile())
}

// isProcessRunning checks if a process with the given PID is running.
func isProcessRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = process.Signal(syscall.Signal(0))
	return err == nil
}
